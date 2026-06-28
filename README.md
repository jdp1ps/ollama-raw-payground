# LLM playground — CoDataSorb

A minimal web playground for the **AI course cycle for the humanities and social
sciences**. It exposes Ollama's `/api/generate` endpoint with a single-shot,
streaming interface — pick a model, set temperature / top_p / top_k /
num_predict, type a prompt, watch the completion stream in.

By default it runs in **raw mode** (`raw: true`): the prompt is fed to the model
verbatim, with no chat template, so learners can see what a model does as a pure
text continuer.

## How it works

- `index.js` — a zero-dependency Node server that:
  - serves `index.html`;
  - proxies `/api/*` to a local Ollama instance (avoids browser CORS);
  - gates every API call behind a shared access code;
  - forces the `raw` flag server-side from configuration.
- `index.html` — the whole UI (controls, prompt field, streaming answer area),
  no build step, no framework.

There are no npm dependencies.

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [Ollama](https://ollama.com/) running locally
- One or more models pulled, e.g.:
  ```bash
  ollama pull smollm:1.7b-base-v0.2-q5_1
  ollama pull qwen2.5:1.5b
  ollama pull llama3
  ```

## Configuration

Copy the example file and edit it:

```bash
cp .env.example .env
```

| Variable      | Default          | Purpose                                                        |
| ------------- | ---------------- | ------------------------------------------------------------- |
| `ACCESS_CODE` | _(empty)_        | Shared code learners must enter. If empty, the API is open.    |
| `RAW`         | `true`           | `true` = prompt fed verbatim; `false` = apply chat template.   |
| `PORT`        | `3000`           | Port the web app listens on.                                  |
| `OLLAMA_HOST` | `127.0.0.1`      | Host of the Ollama instance.                                  |
| `OLLAMA_PORT` | `11434`          | Port of the Ollama instance.                                  |

`.env` is gitignored — it is never committed. Distribute the `ACCESS_CODE` value
to learners out of band.

## Run locally

```bash
npm start
# or: node index.js
```

Open <http://localhost:3000>, enter the access code, choose a model, and prompt.

## Reproducing the VM

The reference instance is a GPU box: `g2-standard-4` (4 vCPU, 16 GB RAM) with
one **NVIDIA L4** (24 GB VRAM), Debian 13, a 100 GB boot disk, standard
(non-preemptible) provisioning. The L4 keeps generation fast and fits all three
models in VRAM at once.

### With gcloud

```bash
gcloud compute instances create llm-playground \
  --project=formation-ia-shs \
  --zone=us-central1-b \
  --machine-type=g2-standard-4 \
  --maintenance-policy=TERMINATE \
  --image-family=debian-13 \
  --image-project=debian-cloud \
  --boot-disk-size=100GB \
  --boot-disk-type=pd-balanced
```

Notes:

- **No `--accelerator` flag.** On the G2 family the GPU is bundled with the
  machine type — `g2-standard-4` always comes with one L4, and passing
  `--accelerator` errors.
- `--maintenance-policy=TERMINATE` is **required** for GPU VMs.
- You need GPU quota (`NVIDIA_L4_GPUS` in `us-central1`) for this to succeed.

### Manually, in the Cloud Console

1. **Compute Engine → VM instances → Create instance**.
2. **Machine configuration**: select the **GPUs** category, GPU type
   **NVIDIA L4**, number of GPUs **1**. Pick machine type **g2-standard-4**.
3. A dialog will note that GPU VMs must be set to stop during host maintenance —
   accept it (this sets *on host maintenance = Terminate*).
4. **Boot disk → Change**: OS **Debian**, version **Debian GNU/Linux 13
   (trixie)**, disk type **Balanced persistent disk**, size **100 GB**.
5. **Networking**: keep the default network; ensure **External IPv4** is set to
   *Ephemeral* (or reserve a static IP) so learners can reach it.
6. Leave provisioning as **Standard** (not Spot/Preemptible). Click **Create**.

### After creating (either method)

The instance is a blank Debian box. Install the **NVIDIA driver** first (see
Google's [GPU driver install
guide](https://cloud.google.com/compute/docs/gpus/install-drivers-gpu)), then
follow the deploy steps below to install Ollama, pull models, and run the app.
Also (re)create the firewall rule if it does not already exist.

## Deploy (Google Compute Engine example)

On a fresh Debian instance:

```bash
# tools
sudo apt-get update && sudo apt-get install -y git nodejs

# ollama (installs and starts a systemd service)
curl -fsSL https://ollama.com/install.sh | sh

# app
git clone https://github.com/jdp1ps/ollama-raw-payground.git
cd ollama-raw-payground
echo "ACCESS_CODE=your-code-here" > .env

# models
ollama pull smollm:1.7b-base-v0.2-q5_1
ollama pull qwen2.5:1.5b
ollama pull llama3
```

Run the app on port 80 (needs root):

```bash
sudo PORT=80 node index.js
```

Open the firewall (from Cloud Shell, not the instance):

```bash
gcloud compute firewall-rules create allow-llm-http \
  --allow tcp:80 --source-ranges 0.0.0.0/0
```

Learners then visit `http://<external-ip>` and enter the access code.

### Avoiding slow first calls

Ollama unloads idle models, making the next request slow while it reloads. To
keep models resident, edit the service:

```bash
sudo SYSTEMD_EDITOR=vim systemctl edit ollama
```

Add:

```ini
[Service]
Environment="OLLAMA_KEEP_ALIVE=-1"
```

Then `sudo systemctl restart ollama` and pre-warm the models once:

```bash
for m in smollm:1.7b-base-v0.2-q5_1 qwen2.5:1.5b llama3; do
  curl -s http://localhost:11434/api/generate -d "{\"model\":\"$m\"}" >/dev/null
done
```

## Managing models

The dropdown is populated from whatever `ollama list` reports. To remove or add
a model:

```bash
ollama rm llama3      # remove (frees disk; re-pull to restore)
ollama pull llama3    # add
```

## Security note

The access code travels in plain HTTP. This is a lightweight classroom gate, not
real authentication — put the app behind HTTPS if it is exposed beyond a trusted
network.
