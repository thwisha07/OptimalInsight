### Environment additions

Add to .env (examples):

REDIS_URL=redis://localhost:6379
# S3 variables as before
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
S3_BUCKET=
S3_ENDPOINT=

Note: If S3 is not configured the app will fall back to local uploads in ./uploads/ for development.
