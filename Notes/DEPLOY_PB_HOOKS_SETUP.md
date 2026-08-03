# Auto-deploying pb_hooks to the droplet — one-time setup

This makes `git push` alone update the live PocketBase droplet whenever
`pb_hooks/*.js` changes — no more manually pasting file contents over SSH
and restarting the service by hand. The workflow itself is already in the
repo (`.github/workflows/deploy-pb-hooks.yml`); it just needs 3 secrets
configured before it'll actually work.

## 1. Generate a dedicated SSH keypair (on your Windows PC, PowerShell)

```powershell
ssh-keygen -t ed25519 -C "github-actions-deploy" -f $env:USERPROFILE\.ssh\pb_deploy_key
```

Press Enter through the passphrase prompt (leave it empty) — this key needs
to work unattended inside GitHub's servers, so it can't be protected by a
passphrase you'd have to type in manually.

This creates two files:
- `pb_deploy_key` — the **private** key. Never share this or paste it
  anywhere except the one GitHub secret in step 3.
- `pb_deploy_key.pub` — the **public** key. Safe to share; this is the one
  that goes on the droplet.

## 2. Add the public key to the droplet

Print the public key so you can copy it:

```powershell
Get-Content $env:USERPROFILE\.ssh\pb_deploy_key.pub
```

Copy the entire output (starts with `ssh-ed25519 AAAA...`). Then, in the
DigitalOcean web console (same terminal you've used for every other droplet
change this project), run:

```bash
echo "PASTE_THE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
```

## 3. Add 3 secrets to the GitHub repo

Print the private key so you can copy it:

```powershell
Get-Content $env:USERPROFILE\.ssh\pb_deploy_key
```

Copy the **entire** output, including the `-----BEGIN OPENSSH PRIVATE
KEY-----` and `-----END OPENSSH PRIVATE KEY-----` lines.

On GitHub: open this repo → **Settings** → **Secrets and variables** →
**Actions** → **New repository secret**, and add these three, one at a
time:

| Secret name | Value |
|---|---|
| `PB_SSH_HOST` | `pb.delcargo.us` (or the droplet's bare IP if that's ever down) |
| `PB_SSH_USERNAME` | `root` |
| `PB_SSH_PRIVATE_KEY` | the full private key you just copied |

## 4. Push and test

The workflow file is already committed. Once the 3 secrets above exist,
either:
- Make any change under `pb_hooks/` and push it — the workflow fires
  automatically, or
- Go to the repo's **Actions** tab → **Deploy PocketBase Hooks** → **Run
  workflow** to trigger it manually without needing an actual pb_hooks
  change.

Check the **Actions** tab for a green checkmark. If it fails, click into
the run — the two most likely causes are a secret typo/missing newline, or
the droplet's firewall not allowing GitHub's IP ranges on port 22 (unlikely
if your own SSH access already works from anywhere, DigitalOcean droplets
default to allowing SSH from any IP unless you've locked it down
yourself).

## Note on security

This gives GitHub Actions the same root SSH access you've been using
manually for every droplet change so far — it's not introducing a new
level of access, just automating the copy-paste step you were already
doing by hand. If you ever want tighter security later, the standard
upgrade is a dedicated non-root deploy user whose SSH key can only run one
specific restricted command (copying to `pb_hooks/` + restarting
PocketBase) — that's a separate, optional hardening step, not required for
this to work.
