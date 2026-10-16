# Recovering Kali after the Mac's network address changes

This guide deliberately contains no real addresses, account names, fingerprints, credentials, or personal filesystem paths. Replace placeholders privately; do not commit a populated connection profile or host-pin file.

## What to do next time

1. Keep Kali running on the Mac. On the Mac, run `ipconfig getifaddr en0`. If it prints nothing, find the active network connection's IPv4 address in **System Settings → Network → Details → TCP/IP**. Linux's `hostname -I` does not work on macOS.
2. Compare that address with Privora's saved environment endpoint. A powered-on VM can still be unreachable when Privora is using an old host address. Keep the existing forwarded SSH port unless the VM's port-forward configuration actually changed.
3. Make a new local copy of the original connection profile. Update only the host address and, when needed, the port and host-pin file path. Retain the environment ID, SSH account, identity file, expected host fingerprint, runner path, and job root. Preserve the original profile as a backup outside the repository.
4. Verify that the new endpoint presents the **same previously trusted SSH host key**. A reachable port or an SSH banner alone does not establish identity. Compare the server fingerprint with the existing trusted fingerprint. If it differs, stop and verify the VM's identity directly; do not disable strict host-key checking or accept an unfamiliar key automatically.
5. Privora requires a dedicated **single-host pin file**. Create a separate local pin file for the new endpoint using only the verified server public key. Its hostname and port notation must match the updated profile. Preserve the original pin file; do not append multiple endpoints to the pin file Privora uses.
6. With remote commands idle, import the updated profile in Privora. The current UI exposes **Import connection profile** in the **New security project** dialog, opened using the shield icon beside Projects. Importing a profile updates the saved connection independently of creating a project: cancel the project dialog afterward. Do not create a replacement project merely to change the address.
7. Click **Check connection** and confirm the updated endpoint shows **Connected**. Existing project and job identities remain intact. Inspect the real status and retained output of any unconfirmed jobs before deciding what to retry. Never automatically replay old commands, recreate lab resources, or repeat testing merely because connectivity returned.

## Conditions enforced by Privora

- An address refresh for an environment used by a project must retain its SSH identity, pinned host fingerprint, runner and job root.
- The new connection must pass an authenticated, pinned capability check before the refreshed profile is saved.
- Active remote commands block address refresh. A failed verification leaves the existing saved profile unchanged.
- A genuinely different VM requires a different environment ID; changing an address does not authorize testing a new target.

## If it still fails

- **Timeout:** check the Mac's current address, network reachability, VM state and SSH port forwarding.
- **Connection refused:** inspect the forwarded port and SSH listener.
- **Host-key mismatch:** verify the server's identity locally; retain the old pin until the change is explained.
- **Authentication failure:** inspect the existing SSH account/key configuration without sharing passwords or private keys.
- **Unconfirmed job:** inspect or reconcile it once the connection works; a timeout does not prove the command never ran.

Keep populated profiles and pin files in private local storage. Reports and troubleshooting notes shared publicly should use placeholders such as `<MAC_HOST>`, `<SSH_PORT>` and `<EXPECTED_FINGERPRINT>`.
