# Acceptance contract
- Distinguish source implemented, local test passed, physical device verified and release verified. None implies the next.
- Each generated video must be decoded, contain valid changing frames and match the requested duration within a frame or a documented model constraint. Never substitute a test pattern for AI inference.
- Queues survive service restarts and terminate or explicitly fail interrupted jobs. Cancellations cannot publish results. Raw media, tokens and prompts stay out of git and CI artifacts.
- Unauthenticated reads/writes fail, one identity cannot read another's media, malformed/oversized files fail, and deleting a project/account clears owned data. Test again before public exposure.
- Offline iPhone edit → preview → share must pass on physical hardware without access to the workstation.
- The developer tests each changed path; independent QA checks a different failure mode. Release also requires green CI, native build, device and TestFlight results, live policy/support URLs, complete privacy answers, signed approval and no outstanding P0/P1 blockers.
- Local agent outputs are proposals. Do not run generated shell commands. No free API transmission of arbitrary prompts, personal data, private code or secrets. Critical work is supervised.
