from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
import boto3
import os
import json
from fastapi.responses import JSONResponse, FileResponse
import uvicorn
from fastapi import FastAPI
from fastapi.responses import  JSONResponse
import subprocess

# from fastapi.params import Form
from fastapi.middleware.cors import CORSMiddleware
# import boto3, os
# from botocore.client import Config
# from botocore.exceptions import BotoCoreError, ClientError
# from decrypt_utils import rsa_chunk_decrypt
# from cryptography.hazmat.primitives.asymmetric import rsa
# from cryptography.hazmat.primitives import serialization 


app = FastAPI()

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


# PRIVATE_KEY_PATH = os.path.join(os.getcwd(), "private.pem")
# PUBLIC_KEY_PATH = os.path.join(os.getcwd(), "public.pem")
S3_BUCKET = os.getenv("BUCKET_NAME")
#S3_BUCKET = "bundlebucketota"
AWS_REGION = "us-east-1"
LOGS_DIR = "./logs"

s3 = boto3.client("s3", region_name=AWS_REGION)
lambda_client = boto3.client("lambda", region_name=AWS_REGION)


class BundleRequest(BaseModel):
    bundle_key: str


# def generate_rsa_keys_if_missing():
#   if not (os.path.exists(PUBLIC_KEY_PATH) and os.path.exists(PRIVATE_KEY_PATH)):
#     print("Generating new RSA key pair...")

#     private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
#     public_key = private_key.public_key()

#     with open(PRIVATE_KEY_PATH, "wb") as f:
#       f.write(
#         private_key.private_bytes(
#           encoding=serialization.Encoding.PEM,
#           format=serialization.PrivateFormat.TraditionalOpenSSL,
#           encryption_algorithm=serialization.NoEncryption(),
#         )
#       )

#     with open(PUBLIC_KEY_PATH, "wb") as f:
#       f.write(
#         public_key.public_bytes(
#           encoding=serialization.Encoding.PEM,
#           format=serialization.PublicFormat.SubjectPublicKeyInfo,
#         )
#       )
#     print("RSA key pair generated (private.pem, public.pem)")
#   else:
#     print("RSA keys already exist, skipping generation.")

# generate_rsa_keys_if_missing()



@app.get("/health")
def health():
    return {"status":"OK"}

@app.get("/get_instance_ip")
async def get_instance_ip():
    ota_server_ip = os.getenv("OTA_SERVER_IP")

    if not ota_server_ip:
        # Try sourcing the file in a subprocess
        try:
            result = subprocess.run(
                ['bash', '-c', 'source /etc/profile.d/ota_server_ip.sh && echo $OTA_SERVER_IP'],
                capture_output=True, text=True
            )
            ota_server_ip = result.stdout.strip()
        except Exception:
            pass

    if ota_server_ip:
        return {
            "server_id": ota_server_ip,
            "port": 8000
        }
    else:
        return {
            "error": "OTA_SERVER_IP not found"
        }

# @app.get("/get_instance_ip")
# async def get_instance_ip():
#     ota_server_ip = os.getenv("OTA_SERVER_IP")

#     return {
#                     "server_id": ota_server_ip,
#                     "port": 8000
#                 }



@app.get("/bundles")
def list_bundles():
    s3 = boto3.client("s3", region_name=AWS_REGION)
    response = s3.list_objects_v2(Bucket=S3_BUCKET)
    files = [item["Key"] for item in response.get("Contents", [])]
    return {"bundles": files}

@app.post("/install-bundle")
def install_bundle(data: BundleRequest):
    payload = {
        "action": "download_bundle",
        "bundle_key": data.bundle_key
    }

    response = lambda_client.invoke(
        FunctionName="OtaBundleDownload",
        InvocationType="RequestResponse",
        Payload=json.dumps(payload)
    )

    result = json.load(response["Payload"])
    return result

# @app.get("/get_public_key/")
# def get_public_key():
#   with open(PUBLIC_KEY_PATH, "rb") as f:
#     return {"public_key": f.read().decode()}
  
# @app.post("/upload_bundle_files/") 
# async def upload_bundle_files(
#   version: str = Form(...),
#   encrypted_access_key: str = Form(...),
#   encrypted_secret_key: str = Form(...),
#   encrypted_session_token: str = Form(None),
#   bucket: str = Form(...),
#   region: str = Form(...),
#   raucb_file: UploadFile = File(...),
#   md5_File: UploadFile = File(...),
# ):
  
#   try:
#     access_key = rsa_chunk_decrypt(encrypted_access_key)
#     secret_key = rsa_chunk_decrypt(encrypted_secret_key)
#     session_token = rsa_chunk_decrypt(encrypted_session_token) if encrypted_session_token else None
#   except Exception as e:
#     raise HTTPException(status_code=400, detail=f"Decryption failed: {e}")
  

#   s3 = boto3.client(
#   "s3",
#   aws_access_key_id=access_key,
#   aws_secret_access_key=secret_key,
#   region_name=region, # Change if your bucket is in a different region
#   aws_session_token=session_token,
#   config=Config(signature_version="s3v4", retries={"max_attempts":10}),
#   verify=False)

#   try:
#     # Upload to S3
#     s3.upload_fileobj(
#       Fileobj=raucb_file.file,
#       Bucket=bucket,
#       Key=f"RZG2L_Release-{version}/{raucb_file.filename}",
#     )
#     s3.upload_fileobj(
#       Fileobj=md5_File.file,
#       Bucket=bucket,
#       Key=f"RZG2L_Release-{version}/{md5_File.filename}"
     
#     )

#     return {
#       "result": "success",
#       "message": f"Uploaded"
#     }

#   except (BotoCoreError, ClientError) as e:
#     return {
#       "result": "error",
#       "message": str(e)
#     }

# @app.post("/api/download_complete")
# def download_complete(data: dict):
#     print(f"Download complete: {data}")
#     return JSONResponse(content={"message": "ACK"}, status_code=200)

# @app.get("/logs/{filename}")
# def view_logs(filename: str):
#     filepath = os.path.join(LOGS_DIR, filename)
#     if not os.path.exists(filepath):
#         return JSONResponse(status_code=404, content={"message": "Log not found"})
#     return FileResponse(filepath)



if __name__ == "__main__":
    uvicorn.run("main:app",host="0.0.0.0",port=8000,reload=True)