<img src="https://files.horizon.pics/53ad0c26-d6dd-4624-bc28-d797766a0169?a=2034&mime1=image&mime2=jpeg&region=eu-central" alt="Aster" width="200"/>

# Aster Security Policy

## Properly Reporting a Vulnerability


**Please ensure you do not open a public GitHub issue for security-related vulnerabilities.**


Send your report to this email: security@astermail.org


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


All encryption and decryption is performed client-side. We will never have access to your plaintext data.


| Channel | Protocol |
|---|---|
| Aster → Aster | X3DH + Double Ratchet with ML-KEM-768 (post-quantum) |
| Aster → External | RSA-4096 OpenPGP – portable, works with GPG, Thunderbird, any PGP client |

**Metadata encrypted:** subject lines, content, contacts, folder structure, search indices, timestamps, attachment data, and much more.


## Coordinated Disclosure

We follow coordinated disclosure. Please give us adequate time to patch the vulnerability before publishing. We're happy to credit you publicly if you'd like – just let us know in your report.


## Acknowledgements

We thank the researchers who help keep Aster secure. Credited disclosures will be listed below once we receive them.
