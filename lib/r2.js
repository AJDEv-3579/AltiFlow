import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Cloudflare R2 environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) are not configured.')
  }

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })
}

export function getR2BucketName() {
  const bucket = process.env.R2_BUCKET_NAME
  if (!bucket) {
    throw new Error('Cloudflare R2 bucket name (R2_BUCKET_NAME) is not configured.')
  }
  return bucket
}

export async function generateR2UploadUrl({ key, contentType, expiresIn = 1800 }) {
  const client = getR2Client()
  const bucket = getR2BucketName()

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType || 'application/octet-stream',
  })

  const uploadUrl = await getSignedUrl(client, command, { expiresIn })
  return uploadUrl
}

export async function generateR2DownloadUrl({ key, expiresIn = 3600 }) {
  const client = getR2Client()
  const bucket = getR2BucketName()

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  })

  const downloadUrl = await getSignedUrl(client, command, { expiresIn })
  return downloadUrl
}

export async function deleteR2Object({ key }) {
  const client = getR2Client()
  const bucket = getR2BucketName()

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  })

  return await client.send(command)
}

export async function getR2ObjectStream({ key, range }) {
  const client = getR2Client()
  const bucket = getR2BucketName()

  const params = {
    Bucket: bucket,
    Key: key,
  }

  if (range) {
    params.Range = range
  }

  const command = new GetObjectCommand(params)
  return await client.send(command)
}

export async function listR2Objects({ prefix }) {
  const client = getR2Client()
  const bucket = getR2BucketName()

  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
  })

  return await client.send(command)
}

