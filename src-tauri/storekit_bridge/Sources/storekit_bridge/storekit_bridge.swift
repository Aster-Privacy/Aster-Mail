//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import Foundation
import StoreKit

public typealias aster_reply_callback = @convention(c) (UInt64, UnsafePointer<CChar>) -> Void
public typealias aster_transaction_callback = @convention(c) (UnsafePointer<CChar>) -> Void

let aster_product_prefix = "org.astermail.ios."

enum bridge_error: String {
    case product_unavailable
    case verification_failed
    case purchase_failed
}

func encode_payload(_ payload: [String: Any]) -> String {
    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload) else {
        return "{\"error\":\"encoding_failed\"}"
    }
    return String(decoding: data, as: UTF8.self)
}

func deliver(_ payload: [String: Any], _ context: UInt64, _ reply: aster_reply_callback) {
    encode_payload(payload).withCString { reply(context, $0) }
}

func deliver_error(_ error: bridge_error, _ context: UInt64, _ reply: aster_reply_callback) {
    deliver(["error": error.rawValue], context, reply)
}

actor transaction_registry {
    static let shared = transaction_registry()

    private var items: [UInt64: Transaction] = [:]

    func keep(_ transaction: Transaction) {
        items[transaction.id] = transaction
    }

    func take(_ id: UInt64) -> Transaction? {
        items.removeValue(forKey: id)
    }
}

final class listener_state: @unchecked Sendable {
    static let shared = listener_state()

    private let lock = NSLock()
    private var started = false

    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !started else { return false }
        started = true
        return true
    }
}

func unit_name(_ unit: Product.SubscriptionPeriod.Unit) -> String {
    switch unit {
    case .day: return "day"
    case .week: return "week"
    case .month: return "month"
    case .year: return "year"
    @unknown default: return "unknown"
    }
}

func describe_product(_ product: Product) -> [String: Any] {
    var payload: [String: Any] = [
        "id": product.id,
        "display_name": product.displayName,
        "description": product.description,
        "display_price": product.displayPrice,
        "price": NSDecimalNumber(decimal: product.price).stringValue,
        "currency_code": product.priceFormatStyle.currencyCode
    ]
    if let period = product.subscription?.subscriptionPeriod {
        payload["period_value"] = period.value
        payload["period_unit"] = unit_name(period.unit)
    }
    return payload
}

func describe_transaction(_ verification: VerificationResult<Transaction>) async -> [String: Any]? {
    guard case .verified(let transaction) = verification,
          transaction.productID.hasPrefix(aster_product_prefix) else { return nil }
    await transaction_registry.shared.keep(transaction)
    var payload: [String: Any] = [
        "transaction_id": String(transaction.id),
        "original_transaction_id": String(transaction.originalID),
        "product_id": transaction.productID,
        "signed_transaction": verification.jwsRepresentation,
        "revoked": transaction.revocationDate != nil
    ]
    if let expiration = transaction.expirationDate {
        payload["expires_at"] = ISO8601DateFormatter().string(from: expiration)
    }
    return payload
}

func forward_transaction(_ verification: VerificationResult<Transaction>, _ callback: aster_transaction_callback) async {
    guard let payload = await describe_transaction(verification) else { return }
    encode_payload(payload).withCString { callback($0) }
}

@_cdecl("aster_storekit_products")
public func aster_storekit_products(_ product_ids: UnsafePointer<CChar>, _ context: UInt64, _ reply: aster_reply_callback) {
    let identifiers = String(cString: product_ids)
        .split(separator: ",")
        .map(String.init)
        .filter { $0.hasPrefix(aster_product_prefix) }
    Task.detached {
        do {
            let products = try await Product.products(for: identifiers)
            let described = products.sorted { $0.price < $1.price }.map(describe_product)
            deliver(["ok": described], context, reply)
        } catch {
            deliver_error(.product_unavailable, context, reply)
        }
    }
}

@_cdecl("aster_storekit_purchase")
public func aster_storekit_purchase(
    _ product_id: UnsafePointer<CChar>,
    _ account_token: UnsafePointer<CChar>,
    _ context: UInt64,
    _ reply: aster_reply_callback
) {
    let identifier = String(cString: product_id)
    let token = UUID(uuidString: String(cString: account_token))
    Task.detached {
        do {
            guard identifier.hasPrefix(aster_product_prefix),
                  let product = try await Product.products(for: [identifier]).first else {
                deliver_error(.product_unavailable, context, reply)
                return
            }
            var options: Set<Product.PurchaseOption> = []
            if let token {
                options.insert(.appAccountToken(token))
            }
            let result = try await product.purchase(options: options)
            switch result {
            case .success(let verification):
                guard let transaction = await describe_transaction(verification) else {
                    deliver_error(.verification_failed, context, reply)
                    return
                }
                deliver(["ok": ["status": "success", "transaction": transaction]], context, reply)
            case .pending:
                deliver(["ok": ["status": "pending"]], context, reply)
            case .userCancelled:
                deliver(["ok": ["status": "cancelled"]], context, reply)
            @unknown default:
                deliver(["ok": ["status": "cancelled"]], context, reply)
            }
        } catch StoreKitError.userCancelled {
            deliver(["ok": ["status": "cancelled"]], context, reply)
        } catch {
            deliver_error(.purchase_failed, context, reply)
        }
    }
}

@_cdecl("aster_storekit_restore")
public func aster_storekit_restore(_ sync: Bool, _ context: UInt64, _ reply: aster_reply_callback) {
    Task.detached {
        var synced = true
        if sync {
            do {
                try await AppStore.sync()
            } catch {
                synced = false
            }
        }
        var transactions: [[String: Any]] = []
        for await entitlement in Transaction.currentEntitlements {
            guard let transaction = await describe_transaction(entitlement),
                  transaction["revoked"] as? Bool == false else { continue }
            transactions.append(transaction)
        }
        deliver(["ok": ["synced": synced, "transactions": transactions]], context, reply)
    }
}

@_cdecl("aster_storekit_finish")
public func aster_storekit_finish(_ transaction_id: UInt64, _ context: UInt64, _ reply: aster_reply_callback) {
    Task.detached {
        if let transaction = await transaction_registry.shared.take(transaction_id) {
            await transaction.finish()
            deliver(["ok": true], context, reply)
            return
        }
        for await unfinished in Transaction.unfinished {
            guard case .verified(let transaction) = unfinished, transaction.id == transaction_id else { continue }
            await transaction.finish()
            deliver(["ok": true], context, reply)
            return
        }
        deliver(["ok": false], context, reply)
    }
}

@_cdecl("aster_storekit_start_listener")
public func aster_storekit_start_listener(_ callback: aster_transaction_callback) {
    guard listener_state.shared.claim() else { return }
    Task.detached {
        for await update in Transaction.updates {
            await forward_transaction(update, callback)
        }
    }
    Task.detached {
        for await unfinished in Transaction.unfinished {
            await forward_transaction(unfinished, callback)
        }
    }
}
