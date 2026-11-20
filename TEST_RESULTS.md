# Test results

On 2026-11-12, local checks passed for 9 API tests, 8 router tests, 3 shared tests, one FFmpeg timeline test, TypeScript, ESLint and formatting. The web project-delete interaction also passed in Chrome with a simulated API.

The Expo iOS export failed when Windows Application Control blocked the unsigned Hermes compiler. No physical iPhone, TestFlight, production backend or generated AI video has been verified. See the test source for each test's precise scope.

The web editor's bundled sample was exported through Chrome on Windows. The downloaded MP4 contained H.264 video at 960×540 and AAC audio, with duration 4.002 seconds. FFmpeg decoded 118 video frames, of which 116 had different hashes. FFmpeg also reported one non-monotonic decoding timestamp while writing a null output; timestamp behavior needs further investigation before a release claim.

Follow-up inspection found all 118 video packet DTS values and all 118 decoded frame timestamps strictly increasing. The null-output warning disappeared when the output encoder time base was set to 1/1000 second. This supports output time-base rounding as the cause in this one sample; other inputs and browsers remain untested.

A separate generated two-second source with moving video and a 440 Hz sine tone was imported and exported through Chrome. The downloaded MP4 duration was 2.018 seconds and FFmpeg measured audio at -21.1 dB mean, confirming the export contained audible non-silent audio. This is a synthetic local test, not an iOS or AI-generation test.

Expo autolinking on Windows resolved the local KareviaEditor pod and module class. This checks discovery only; Swift compilation remains unverified.

On 2026-11-13 all three Wan 2.2 model files passed their pinned SHA-256 checks. The first text-to-video smoke test timed out waiting for ComfyUI startup, before generating a clip. A separate ComfyUI startup detected the RTX 5060 Ti with 8123 MB VRAM and eventually started its server. A second smoke attempt was started after that diagnostic. No generated-video success is claimed until the output passes verification.

The second text-to-video smoke test passed on 2026-11-13. It produced a 512×288 H.264 clip with 13 decoded frames and a duration of 1.083 seconds. First-to-last mean absolute luma difference was 11.441 on 32×32 frames. Elapsed time was 155.48 seconds, and sampled system GPU memory peaked at 7,613 MiB. These checks show a decodable, changing clip for this single prompt and workstation. They do not establish image-to-video or production capacity.

The image-to-video smoke test passed on the same workstation. It produced a 512×288 H.264 clip with 13 decoded frames and duration 1.083 seconds. First-to-last mean absolute luma difference was 4.067. Elapsed time was 161.67 seconds and sampled total GPU memory peaked at 7,585 MiB. The input was a synthetic orange sphere. Broader prompt quality, consistency and production capacity remain unverified.

The authenticated FastAPI integration smoke test submitted a text-to-video job, polled the real worker, downloaded its result, and decoded a 512×288 H.264 video with 13 frames and duration 1.083 seconds. First-to-last mean absolute luma difference was 51.315. The test used a temporary workspace and synthetic prompt.

The same integration test then uploaded a synthetic PNG and submitted an image-to-video job. The downloaded H.264 output was 512×288, 13 frames and 1.083 seconds, with first-to-last mean absolute luma difference of 37.229. The test used a temporary workspace and a synthetic source image.

The local FFmpeg whisper.cpp filter transcribed a synthetic English speech clip into an editable SRT with the expected sentence. The SRT was then muxed into a three-second H.264/AAC clip as a selectable mov_text track. The multilingual tiny model has not been quality-tested on Turkish or diverse speakers. A caption extending beyond a shorter two-second timeline caused the current duration validator to reject the export.

An authenticated API test uploaded a synthetic MP4 with speech, queued local transcription, and downloaded an SRT containing the expected English sentence. The web caption form was also checked in Chrome with a simulated API. The mobile share path remains unverified on a physical iPhone.

A single synthetic Turkish voice sample said “Merhaba, yeni video projemize hoş geldiniz.” The multilingual base model produced “Merhaba, yeni video projemizi hoş geldiniz.” With the previous three-second transcription queue both tiny and base models also added a false music cue. A 30-second queue removed that extra cue on this sample but did not correct the word ending. This is not a representative quality benchmark; human subtitle review is required.

After clipping subtitle cues to the timeline, the previously failing two-second export succeeded with duration 2.021 seconds. The extracted subtitle ended at exactly 2.000 seconds. Unit checks also confirm cues starting after the timeline are omitted.

On 2026-11-13, `python services/ai-engine/quality_sample.py` generated a fixed-seed perfume-product sample locally in 215.28 seconds. It decoded as H.264, 512×288, 13 frames and 1.083 seconds. A manual inspection of the middle frame showed a recognizable bottle and reflections but low detail and visible distortion; it does not establish photorealism or competitive quality. Motion, other prompts and comparison against the reference product remain unassessed. The video and matching JSON report are retained in the workstation's `KareviaStudio/verification/quality` directory, separately from capability proofs.

The same prompt and seed at 24 steps produced a second 512×288, 13-frame clip in 138.70 seconds. Its middle frame had a more coherent bottle shape, but still showed soft detail and invented lettering despite the prompt. This single-frame judgment does not establish that 24 steps generally improve video quality; motion and repeatability need assessment. One run per setting also cannot establish speed differences because startup and workstation conditions vary. Production defaults remain unchanged.

The shot planner was exercised in headless Chrome over local HTTP: it rejected an external music path, downloaded a plan with a clip, music and subtitles, and retained the music and subtitle names after reload. The downloaded plan was then assembled from synthetic local media by FFmpeg, yielding H.264, AAC and a selectable mov_text subtitle stream. Run `node tests/shot-planner.cjs` with Chrome, Python and FFmpeg installed. This does not test real user media or iPhone playback.
