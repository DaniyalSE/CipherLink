"""Self-signed certificate helper."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def create_self_signed(subject_info: dict[str, str]) -> dict[str, str]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    name_attributes = [
        x509.NameAttribute(x509.NameOID.COMMON_NAME, subject_info.get("commonName", "CipherLink User")),
        x509.NameAttribute(x509.NameOID.ORGANIZATION_NAME, subject_info.get("organization", "CipherLink")),
    ]
    if "country" in subject_info:
        name_attributes.append(x509.NameAttribute(x509.NameOID.COUNTRY_NAME, subject_info["country"]))

    subject = issuer = x509.Name(name_attributes)
    valid_from = datetime.now(timezone.utc)
    valid_to = valid_from + timedelta(days=365)

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(valid_from)
        .not_valid_after(valid_to)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(private_key, hashes.SHA256())
    )

    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode("ascii")
    return {
        "cert_pem": cert_pem,
        "serial": hex(cert.serial_number),
        "valid_from": valid_from.isoformat(),
        "valid_to": valid_to.isoformat(),
    }
