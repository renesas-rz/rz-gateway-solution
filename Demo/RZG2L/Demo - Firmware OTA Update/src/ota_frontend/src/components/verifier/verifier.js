import React, { useState, useEffect } from "react";
import axios from "axios";
import SparkMD5 from "spark-md5";
import JSEncrypt from "jsencrypt";
import {
  Box,
  Button,
  Typography,
  TextField,
  Alert,
  LinearProgress,
  IconButton,
  InputAdornment,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DescriptionIcon from "@mui/icons-material/Description";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import CircularProgress from "@mui/material/CircularProgress";
import { useBaseURL } from "../../BaseURLContext";
import forge from "node-forge"


function Verifier() {
  const {baseURL} = useBaseURL();
  const [raucbFile, setRaucbFile] = useState(null);
  const [md5File, setMd5File] = useState(null);
  const [version, setVersion] = useState("");
  const [awsAcessKey, setawsAcessKey] = useState("")
  const [awsSecretAcessKey, setawsSecretAcessKey] = useState("");
  const [awsSessionKey, setawsSessionKey] = useState("");
  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("");
  const [md5Match, setMd5Match] = useState(false);
  const [responseMsg, setResponseMsg] = useState("");
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [publicKey, setPublicKey] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);


  useEffect(() => {
    fetch(`${baseURL}/get_public_key/`)
      .then((res) => res.json())
      .then((data) => setPublicKey(data.public_key))
      .catch((err) => console.error("Failed to load public key", err));
  }, [publicKey]);


  const rsaChunkEncrypt = (text, pemKey) => {
    const chunks = [];
    const publicKey = forge.pki.publicKeyFromPem(pemKey);
    for (let i = 0; i < text.length; i += 190) {
      const chunk = text.substring(i, i + 190);
      const encrypted = publicKey.encrypt(chunk, "RSA-OAEP", {
        md: forge.md.sha256.create(),
      });
      const encoded = forge.util.encode64(encrypted);
      chunks.push(encoded);
    }
    return chunks.join(":::");
  };

  const maskValue = (value, visibleCount = 4) => {
    if (!value) return "";
    const visible = value.slice(0, visibleCount);
    return visible + "*".repeat(Math.max(value.length - visibleCount, 0));
  };


  const checkMd5Match = async (raucbFile, md5File) => {
    setChecking(true);
    setProgress(0);

    const chunkSize = 5 * 1024 * 1024; // 5MB
    const chunks = Math.ceil(raucbFile.size / chunkSize);
    const spark = new SparkMD5.ArrayBuffer();

    let currentChunk = 0;
    const fileReader = new FileReader();

    return new Promise((resolve) => {
      fileReader.onload = async (e) => {
        spark.append(e.target.result);
        currentChunk++;
        setProgress(Math.floor((currentChunk / chunks) * 100));

        if (currentChunk < chunks) {
          loadNextChunk();
        } else {
          const actualMd5 = spark.end().toLowerCase();

          const mdText = await md5File.text();
          const match = mdText.match(/([a-fA-F0-9]{32})/);
          if (!match) {
            setMd5Match(false);
            setResponseMsg("No valid MD5 found in .md5 file");
          } else {
            const expectedMd5 = match[1].trim().toLowerCase();
            const matchResult = expectedMd5 === actualMd5;
            setMd5Match(matchResult);
            setResponseMsg(
              matchResult ? "MD5-matched" : "MD5-mismatch"
            );
          }

          setChecking(false);
          resolve();
        }
      };

      fileReader.onerror = () => {
        setResponseMsg("Failed to read file");
        setChecking(false);
        resolve();
      };

      const loadNextChunk = () => {
        const start = currentChunk * chunkSize;
        const end = Math.min(start + chunkSize, raucbFile.size);
        const blob = raucbFile.slice(start, end);
        fileReader.readAsArrayBuffer(blob);
      };

      loadNextChunk();
    });
  };

  const handleRaucbChange = (e) => {
    const file = e.target.files[0];
    setRaucbFile(file);
    if (file && md5File) checkMd5Match(file, md5File);
  };

  const handleMd5Change = (e) => {
    const file = e.target.files[0];
    setMd5File(file);
    if (file && raucbFile) checkMd5Match(raucbFile, file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!raucbFile || !md5File || !version || !md5Match) return;

    if (!publicKey) {
      return alert("public Key not loaded yet!")
    }
  
    const encryptedAccessKey = rsaChunkEncrypt(awsAcessKey, publicKey);
    const encryptedSecretKey = rsaChunkEncrypt(awsSecretAcessKey, publicKey);
    const encryptedSessionToken = rsaChunkEncrypt(awsSessionKey, publicKey);

    const formData = new FormData();
    formData.append("version", version);
    formData.append("encrypted_access_key", encryptedAccessKey);
    formData.append("encrypted_secret_key", encryptedSecretKey);
    if (awsSessionKey) {
      formData.append("encrypted_session_token", encryptedSessionToken);
    }
    formData.append("bucket", bucket)
    formData.append("region", region)
    formData.append("raucb_file", raucbFile);
    formData.append("md5_File", md5File);
    setIsUploading(true);
    setResponseMsg("")

    try {
      const res = await axios.post(`${baseURL}/upload_bundle_files/`, formData, {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        },
      });
      setResponseMsg(res.data?.message || "");
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
      setResponseMsg("Upload failed: " + detail);
    }
    finally {
      setIsUploading(false)
    }
  };

  const canSubmit = raucbFile && md5File && version && md5Match && !checking;

  return (
    <Box sx={{ p: 4, fontFamily: "Arial", maxWidth: 600 }}>
      <Typography variant="h5" gutterBottom>
        RAUC Bundle Uploader
      </Typography>

      <form onSubmit={handleSubmit}>
        <TextField
          fullWidth
          label="Version"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="e.g., v1.0.0"
          required
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          label="AccessKey"
          //  type="password"
          //  value={awsAcessKey}
          value={maskValue(awsAcessKey)}
          onChange={(e) => setawsAcessKey(e.target.value)}
          inputProps={{ autoComplete: "off" }}
          placeholder="e.g., Hwdssusdsdjsjbvksv"
          required
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          label="awsSecretAcessKey"
          //  type="password"
          //  value={awsSecretAcessKey}
          value={maskValue(awsSecretAcessKey)}
          onChange={(e) => setawsSecretAcessKey(e.target.value)}
          placeholder="e.g., Eddvbdvdvd/dfgd34334566878"
          required
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          label="awsSessionKey"
          // type="password"
          //  value={awsSessionKey}
          value={maskValue(awsSessionKey)}
          onChange={(e) => setawsSessionKey(e.target.value)}
          placeholder="e.g., Eddvbdvdvd/dfgd34334566878"
          required
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          label="S3 bucket name"
          value={bucket}
          onChange={(e) => setBucket(e.target.value)}
          //  placeholder="e.g., abc-123"
          //  required
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          label="Region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          //  placeholder="e.g., abc-123"
          //  required
          sx={{ mb: 2 }}
        />

        <Button
          fullWidth
          variant="contained"
          component="label"
          startIcon={<CloudUploadIcon />}
          sx={{ mb: 1 }}
        >
          Upload RAUCB File
          <input type="file" accept=".raucb" hidden onChange={handleRaucbChange} />
        </Button>
        {raucbFile && (
          <Typography variant="body2" color="textSecondary">
            Selected: {raucbFile.name}
          </Typography>
        )}

        <Button
          fullWidth
          variant="contained"
          component="label"
          startIcon={<DescriptionIcon />}
          sx={{ mt: 2, mb: 1 }}
        >
          Upload MD5 File
          <input type="file" accept=".md5" hidden onChange={handleMd5Change} />
        </Button>
        {md5File && (
          <Typography variant="body2" color="textSecondary">
            Selected: {md5File.name}
          </Typography>
        )}

        {checking && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2">Validating MD5...</Typography>
            <LinearProgress variant="determinate" value={progress} />
          </Box>
        )}

        <Button
          fullWidth
          variant="contained"
          type="submit"
          color="success"
          sx={{ mt: 3 }}
          disabled={!canSubmit}
        >
          Upload
        </Button>
      </form>

      {/* Fallback message in case uploadProgress is 0 */}
      {isUploading && (
        <Box display="flex" flexDirection="column" alignItems='center' justifyContent="center" mt={2}>
          <CircularProgress />
          <Typography variant="h6" mt={1} sx={{ m1: 2 }}>Uploading......</Typography>
        </Box>
      )}

      {!isUploading && responseMsg && (
        <Alert
          sx={{ mt: 2 }}
          severity={responseMsg.includes("Uploaded") || responseMsg.includes("MD5-matched") ? "success" : "error"}
          icon={responseMsg.includes("Uploaded") || responseMsg.includes("MD5-matched") ? <CheckCircleIcon /> : <ErrorOutlineIcon />}
        >
          {responseMsg}
        </Alert>
      )}
    </Box>
  );
}
Verifier.propTypes = {};

Verifier.defaultProps = {};

export default Verifier;
