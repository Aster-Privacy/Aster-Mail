import os, re, sys

BASE = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "i18n", "translations")

patches = {
    "de.ts": (
        "E-Mail-Authentifizierung pruft, ob eine Nachricht wirklich von der angegebenen Domain stammt. Schlagt eine Prufung fehl, kann die Nachricht gefalscht oder fehlerhaft weitergeleitet worden sein.",
        "SPF (Sender Policy Framework) pruft, ob der sendende Server vom Domain-Inhaber autorisiert ist. Ein Fehlschlag bedeutet, dass die E-Mail von einem nicht freigegebenen Server gesendet wurde.",
        "DKIM (DomainKeys Identified Mail) prueft eine kryptografische Signatur der sendenden Domain. Ein Fehlschlag bedeutet, dass die Signatur fehlt, ungultig ist oder die Nachricht verandert wurde.",
        "DMARC sagt Empfangern, wie mit Nachrichten umzugehen ist, wenn SPF oder DKIM fehlschlagen. Ein Fehlschlag bedeutet, dass die Domain diese Nachricht nicht autorisiert.",
    ),
    "es.ts": (
        "La autenticacion de correo verifica que un mensaje realmente proviene del dominio que indica. Cuando una verificacion falla, el mensaje puede estar falsificado o reenviado de forma que rompe la firma.",
        "SPF (Sender Policy Framework) comprueba si el servidor emisor esta autorizado por el dominio. Un fallo significa que el correo se envio desde un servidor no aprobado.",
        "DKIM (DomainKeys Identified Mail) verifica una firma criptografica anadida por el dominio. Un fallo significa que la firma falta, es invalida o el mensaje fue alterado.",
        "DMARC indica al receptor que hacer cuando SPF o DKIM fallan. Un fallo significa que el dominio no autoriza este mensaje.",
    ),
    "fr.ts": (
        "L'authentification email verifie qu'un message provient bien du domaine annonce. Quand un controle echoue, le message peut etre usurpe, falsifie ou transfere d'une maniere qui casse la signature.",
        "SPF (Sender Policy Framework) verifie si le serveur expediteur est autorise par le proprietaire du domaine. Un echec signifie que l'email a ete envoye depuis un serveur non approuve.",
        "DKIM (DomainKeys Identified Mail) verifie une signature cryptographique ajoutee par le domaine expediteur. Un echec signifie que la signature est absente, invalide ou le message a ete modifie.",
        "DMARC indique aux destinataires que faire si SPF ou DKIM echoue. Un echec signifie que le domaine n autorise pas ce message.",
    ),
    "it.ts": (
        "L'autenticazione email verifica che un messaggio provenga davvero dal dominio dichiarato. Quando un controllo fallisce, il messaggio puo essere falsificato o inoltrato in modo da rompere la firma.",
        "SPF (Sender Policy Framework) controlla se il server mittente e autorizzato dal proprietario del dominio. Un fallimento indica che l email proviene da un server non approvato.",
        "DKIM (DomainKeys Identified Mail) verifica una firma crittografica aggiunta dal dominio mittente. Un fallimento indica che la firma manca, e invalida o il messaggio e stato alterato.",
        "DMARC dice ai destinatari cosa fare quando SPF o DKIM falliscono. Un fallimento indica che il dominio non autorizza questo messaggio.",
    ),
    "nl.ts": (
        "E-mailauthenticatie verifieert dat een bericht echt afkomstig is van het opgegeven domein. Bij een mislukte controle kan het bericht vervalst zijn of zo doorgestuurd dat de handtekening ongeldig werd.",
        "SPF controleert of de verzendende server door de domeineigenaar is gemachtigd. Een mislukking betekent dat de e-mail van een niet-goedgekeurde server is verzonden.",
        "DKIM verifieert een cryptografische handtekening toegevoegd door het verzendende domein. Een mislukking betekent dat de handtekening ontbreekt, ongeldig is of het bericht is gewijzigd.",
        "DMARC vertelt ontvangers wat te doen als SPF of DKIM mislukt. Een mislukking betekent dat het domein dit bericht uitdrukkelijk niet autoriseert.",
    ),
    "pl.ts": (
        "Uwierzytelnianie poczty sprawdza czy wiadomosc rzeczywiscie pochodzi z deklarowanej domeny. Niepowodzenie moze oznaczac, ze wiadomosc jest sfalsyfikowana lub przekazana w sposob ktory zepsul podpis.",
        "SPF (Sender Policy Framework) sprawdza, czy serwer wysylajacy jest autoryzowany przez wlasciciela domeny. Niepowodzenie oznacza wyslanie z niezatwierdzonego serwera.",
        "DKIM (DomainKeys Identified Mail) weryfikuje kryptograficzny podpis dodany przez domene. Niepowodzenie oznacza brak, niewazny podpis lub modyfikacje wiadomosci.",
        "DMARC mowi odbiorcom co robic gdy SPF lub DKIM nie przejdzie. Niepowodzenie oznacza, ze domena nie autoryzuje tej wiadomosci.",
    ),
    "pt.ts": (
        "A autenticacao de email verifica se uma mensagem realmente vem do dominio declarado. Quando uma verificacao falha, a mensagem pode ser falsificada ou encaminhada de forma que quebra a assinatura.",
        "SPF (Sender Policy Framework) verifica se o servidor remetente esta autorizado pelo dono do dominio. Uma falha indica envio de servidor nao aprovado.",
        "DKIM (DomainKeys Identified Mail) verifica uma assinatura criptografica adicionada pelo dominio. Uma falha indica assinatura ausente, invalida ou mensagem alterada.",
        "DMARC informa aos receptores o que fazer quando SPF ou DKIM falham. Uma falha indica que o dominio nao autoriza esta mensagem.",
    ),
    "tr.ts": (
        "E-posta kimlik dogrulamasi, bir mesajin gercekten beyan edilen alan adindan geldigini dogrular. Bir kontrol basarisiz olursa mesaj sahte olabilir veya imzayi bozacak sekilde iletilmis olabilir.",
        "SPF (Sender Policy Framework), gonderen sunucunun alan adi sahibi tarafindan yetkilendirilip yetkilendirilmedigini kontrol eder. Basarisizlik onaylanmamis bir sunucudan gonderildigi anlamina gelir.",
        "DKIM (DomainKeys Identified Mail), gonderen alan adi tarafindan eklenen kriptografik imzayi dogrular. Basarisizlik imzanin eksik, gecersiz veya mesajin degistirildigi anlamina gelir.",
        "DMARC, SPF veya DKIM basarisiz oldugunda alicilara ne yapacaklarini soyler. Basarisizlik alan adinin bu mesaji yetkilendirmedigi anlamina gelir.",
    ),
    "ru.ts": (
        "Authentication checks whether a message really came from its claimed domain. A failure means the message may be spoofed or forwarded in a way that breaks the signature.",
        "SPF checks whether the sending server is authorized by the domain owner. A failure means the email came from an unapproved server.",
        "DKIM verifies a cryptographic signature added by the sending domain. A failure means the signature is missing, invalid, or the message was altered.",
        "DMARC tells receivers what to do when SPF or DKIM fail. A failure means the domain does not authorize this message.",
    ),
    "ja.ts": (
        "Authentication checks whether a message really came from its claimed domain. A failure means the message may be spoofed or forwarded in a way that breaks the signature.",
        "SPF checks whether the sending server is authorized by the domain owner. A failure means the email came from an unapproved server.",
        "DKIM verifies a cryptographic signature added by the sending domain. A failure means the signature is missing, invalid, or the message was altered.",
        "DMARC tells receivers what to do when SPF or DKIM fail. A failure means the domain does not authorize this message.",
    ),
    "ko.ts": (
        "Authentication checks whether a message really came from its claimed domain. A failure means the message may be spoofed or forwarded in a way that breaks the signature.",
        "SPF checks whether the sending server is authorized by the domain owner. A failure means the email came from an unapproved server.",
        "DKIM verifies a cryptographic signature added by the sending domain. A failure means the signature is missing, invalid, or the message was altered.",
        "DMARC tells receivers what to do when SPF or DKIM fail. A failure means the domain does not authorize this message.",
    ),
    "ar.ts": (
        "Authentication checks whether a message really came from its claimed domain. A failure means the message may be spoofed or forwarded in a way that breaks the signature.",
        "SPF checks whether the sending server is authorized by the domain owner. A failure means the email came from an unapproved server.",
        "DKIM verifies a cryptographic signature added by the sending domain. A failure means the signature is missing, invalid, or the message was altered.",
        "DMARC tells receivers what to do when SPF or DKIM fail. A failure means the domain does not authorize this message.",
    ),
    "zh-CN.ts": (
        "Authentication checks whether a message really came from its claimed domain. A failure means the message may be spoofed or forwarded in a way that breaks the signature.",
        "SPF checks whether the sending server is authorized by the domain owner. A failure means the email came from an unapproved server.",
        "DKIM verifies a cryptographic signature added by the sending domain. A failure means the signature is missing, invalid, or the message was altered.",
        "DMARC tells receivers what to do when SPF or DKIM fail. A failure means the domain does not authorize this message.",
    ),
}

for fname, (intro, spf, dkim, dmarc) in patches.items():
    path = os.path.join(BASE, fname)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    if "auth_fail_tooltip_intro" in content:
        print("SKIP " + fname + ": already patched")
        continue
    needle = re.compile(r'^(\s*)auth_fail_banner_body:\s*"[^"]*",\s*$', re.MULTILINE)
    m = needle.search(content)
    if not m:
        print("SKIP " + fname + ": no body line")
        continue
    indent = m.group(1)
    insertion = (
        "\n" + indent + 'auth_fail_tooltip_intro: "' + intro + '",'
        + "\n" + indent + 'auth_fail_tooltip_spf: "' + spf + '",'
        + "\n" + indent + 'auth_fail_tooltip_dkim: "' + dkim + '",'
        + "\n" + indent + 'auth_fail_tooltip_dmarc: "' + dmarc + '",'
    )
    new_content = content[:m.end()] + insertion + content[m.end():]
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("OK " + fname)
