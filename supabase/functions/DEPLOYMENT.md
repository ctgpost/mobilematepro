# Edge Function deployment settings

All deployed functions in this repository require JWT verification. The functions also validate the caller and required application role before using the service-role client.

Set the Supabase Edge Function secret `APP_ALLOWED_ORIGINS` to a comma-separated list of exact browser origins, for example:

```text
APP_ALLOWED_ORIGINS=https://your-production-domain.example,https://your-preview-domain.example
```

Do not use `*`. Include each legitimate production/preview origin explicitly. Requests without an Origin header remain usable for server-to-server calls; browser requests from unlisted origins are rejected.

Required Cloudinary secrets:
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

The Supabase project URL, anon key and service-role key are supplied by the Supabase runtime. Never expose the service-role key to browser code.
