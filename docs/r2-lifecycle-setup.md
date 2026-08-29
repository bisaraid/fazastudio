# Setup Cloudflare R2 Lifecycle Rule

1. Buka Cloudflare Dashboard → R2 → pilih bucket
2. Settings → Lifecycle rules → Add rule
3. Rule untuk free:
   - Prefix: "free/"
   - Action: Delete object
   - Days after creation: 1
4. Prefix "premium/" → tidak perlu rule (simpan permanen)