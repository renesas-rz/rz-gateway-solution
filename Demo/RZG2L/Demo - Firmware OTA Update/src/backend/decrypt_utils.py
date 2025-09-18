from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend
import base64

PRIVATE_KEY_PATH = "private.pem"

def load_private_key():
  with open(PRIVATE_KEY_PATH, "rb") as key_file:
    return serialization.load_pem_private_key(
      key_file.read(),
      password=None,
      backend=default_backend() # <-- Required backend
    )

def rsa_chunk_decrypt(encrypted_text: str):
  private_key = load_private_key()
  chunks = encrypted_text.split(":::")
  decrypted = ""
  for chunk in chunks:
    if not chunk.strip():
      continue
    encrypted_bytes = base64.b64decode(chunk)
    part = private_key.decrypt(
      encrypted_bytes,
      padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        algorithm=hashes.SHA256(),
        label=None
      )
    )
    decrypted += part.decode()
  return decrypted