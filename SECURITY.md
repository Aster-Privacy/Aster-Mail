<img width="200" alt="aster_horizontalv2" src="https://github.com/user-attachments/assets/a337e975-996d-4672-a92b-b809591f389a" />

# Aster Security Policy

## Properly Reporting a Vulnerability


**Please ensure you do not open a public GitHub issue for security-related vulnerabilities.**


Send your report to this email: security@astermail.org

To encrypt your report, use our OpenPGP key:

- Fingerprint: `3E1D A8FA 5D69 9CA0 3F57 11CA 52F1 68E7 F816 A832`
- Download: [security@astermail.org public key](https://keys.openpgp.org/vks/v1/by-fingerprint/3E1DA8FA5D699CA03F5711CA52F168E7F816A832)

The same key signs our [warrant canary](https://astermail.org/notices/canary.txt), so you can check the fingerprint against it.

You can also submit reports through our vulnerability disclosure program on Bugcrowd: https://bugcrowd.com/engagements/aster-privacy-vdpc


We will read your report within 48 hours and make sure to resolve critical vulnerabilities within seven days. We will make sure to keep you updated throughout the entire process. 


## Scope

This security policy covers all of our Aster products and infrastructure:

- Aster Mail (astermail.org)
- All repositories under github.com/Aster-Privacy


## Safe Harbor


We will never pursue legal action against researchers who:


- Report vulnerabilities in good faith 
- Do not access, modify, or exfiltrate user data
- Do not disrupt service availability or degrade user experience
- Allow us a reasonable timeframe to respond before public disclosure


## Encryption Architecture


Mail between Aster users is encrypted and decrypted on your device, so the server never has access to its plaintext. Mail to an outside address whose recipient has no OpenPGP key is handed to the mail server for delivery, as with any provider. Mail that arrives from outside Aster without OpenPGP encryption reaches the server readable, and the server encrypts it with your public key as soon as it arrives.


| Channel | Protocol |
|---|---|
| Aster → Aster | X3DH + Double Ratchet with ML-KEM-768 (post-quantum) |
| Aster → External | Ed25519 OpenPGP when the recipient publishes a key – portable, works with GPG, Thunderbird, any PGP client |

**Encrypted data:** subject lines, message content, contacts, folder structure, search indices, and attachment data. Routing data that mail delivery depends on, such as sender and recipient addresses and timestamps, stays visible to the server.

The web app runs code that your browser downloads from Aster each time you open it, so it relies on the server delivering the published code. The desktop and mobile apps ship as signed builds that you can check against the public source, which removes that dependency.


## Coordinated Disclosure

We follow coordinated disclosure. Please give us adequate time to patch the vulnerability before publishing. We're happy to credit you publicly if you'd like – just let us know in your report.


## Acknowledgements

We thank the researchers who help keep Aster secure.

- [diogovbs](https://github.com/diogovbs) (September to October 2026): a series of private reports covering the web and desktop clients, remote content handling, and inbound mail processing. We fixed every finding in coordination with the reporter.
- [NotAFlightRisk](https://github.com/NotAFlightRisk) (October to November 2026): private reports covering sender verification for mail between Aster accounts and the Require encryption setting.
