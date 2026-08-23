"""
Offline-Tool für Sascha, NIE Teil der ausgelieferten App:
- `python scripts/licensing_keygen.py genkey [--out PFAD]`
  Erzeugt ein neues Ed25519-Vendor-Schlüsselpaar. Der private Schlüssel wird als
  PEM-Datei gespeichert (Default: außerhalb des Repos, siehe --out) – diese Datei
  NIEMALS committen, NIEMALS mit dem Produkt ausliefern. Der öffentliche Schlüssel
  wird zusätzlich base64 ausgegeben, um ihn in backend/licensing/keys.py
  (LICENSE_PUBLIC_KEY_B64) einzutragen – das darf öffentlich sein.

- `python scripts/licensing_keygen.py issue --key PFAD --customer "Kundenname"`
  Erzeugt einen signierten Lizenzschlüssel für einen Kunden, mit dem privaten
  Schlüssel aus PFAD. Dieser String geht an den Kunden (z.B. per E-Mail nach
  Kauf über Gumroad/Lemonsqueezy), nicht der private Schlüssel selbst.
"""
import argparse
import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.licensing.core import issue_license_key

DEFAULT_KEY_PATH = Path(__file__).resolve().parent.parent / "backend" / "licensing" / "Keys" / "license_private_key.pem"


def cmd_genkey(args: argparse.Namespace) -> None:
    out_path = Path(args.out) if args.out else DEFAULT_KEY_PATH
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists() and not args.force:
        print(f"Existiert bereits: {out_path} (--force zum Überschreiben)")
        return

    private_key = Ed25519PrivateKey.generate()
    pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    out_path.write_bytes(pem)
    out_path.chmod(0o600)

    public_bytes = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    public_b64 = base64.urlsafe_b64encode(public_bytes).rstrip(b"=").decode("ascii")

    print(f"Privater Schlüssel gespeichert unter: {out_path}")
    print("NIEMALS committen oder mit der App ausliefern.")
    print()
    print("Öffentlichen Schlüssel in backend/licensing/keys.py eintragen:")
    print(f'LICENSE_PUBLIC_KEY_B64 = "{public_b64}"')


def cmd_issue(args: argparse.Namespace) -> None:
    key_path = Path(args.key)
    pem = key_path.read_bytes()
    private_key = serialization.load_pem_private_key(pem, password=None)
    if not isinstance(private_key, Ed25519PrivateKey):
        print("Fehler: Datei enthält keinen Ed25519-Schlüssel")
        return

    key_str = issue_license_key(args.customer, private_key)
    print(f"Lizenzschlüssel für {args.customer!r}:")
    print(key_str)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_genkey = sub.add_parser("genkey", help="Neues Vendor-Schlüsselpaar erzeugen")
    p_genkey.add_argument("--out", help=f"Pfad für den privaten Schlüssel (Default: {DEFAULT_KEY_PATH})")
    p_genkey.add_argument("--force", action="store_true", help="Bestehende Datei überschreiben")
    p_genkey.set_defaults(func=cmd_genkey)

    p_issue = sub.add_parser("issue", help="Lizenzschlüssel für einen Kunden erzeugen")
    p_issue.add_argument("--key", required=True, help="Pfad zum privaten Vendor-Schlüssel (PEM)")
    p_issue.add_argument("--customer", required=True, help="Kundenname/-ID, die im Schlüssel steht")
    p_issue.set_defaults(func=cmd_issue)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
