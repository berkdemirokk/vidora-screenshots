# Architecture decisions
- Karevia is local-first. A private workstation is a distinct trust boundary. A remote iPhone needs an explicitly configured secure reachable workstation. 127.0.0.1 on the phone refers to the phone.
- Client owns the editing interaction. Only media explicitly submitted for a workstation job crosses that boundary. GPU work is an asynchronous job, never an HTTP request left waiting on inference.
- Private single-workstation development uses SQLite for persistence/queue, one worker, bounded jobs and filesystem-owned media. PostgreSQL + Redis for multi-user public operation is a migration milestone, not an installed service. Docker Desktop is installed; daemon not running on initial inspection.
- FFmpeg edits are deterministic; generative video is a distinct provider with model weights, workflow, license and hardware checks. FFmpeg can encode valid fixtures but does not prove neural video inference.
- Developer assistance uses an independent Ollama CLI and HTTP API. The worker and router share a per-host GPU lease. Local outputs are proposals. No private source or media flows to a free API.
- GitHub is private. Do not commit workstation secrets, media, caches, production DBs, checkpoints or dependency directories. Hosted runners never perform personal GPU jobs. Keep live publishing behind release and quota gates.
- Physical iPhone, remote production service and TestFlight are separate verification targets. Local development evidence alone cannot authorize release.
