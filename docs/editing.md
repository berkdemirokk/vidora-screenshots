# Assemble a local cut
The shot desk at /shot-planner/index.html records creative notes and timing in this browser. Enter a clip filename for each shot, optionally add a music filename and SRT subtitle filename, confirm usage rights for all media, select the aspect ratio, then download the edit plan. Put the plan and referenced files in the same folder and run `python tools/timeline.py karevia-timeline.json master.mp4`. The separate storyboard download preserves notes and optional audio and subtitle settings and can be reopened in the shot desk. The export embeds subtitles as a selectable track; review transcription and timing before sharing.

Use “Prepare this shot for generation” to transfer a shot's description, aspect and duration to the workstation screen. Once its job succeeds, “Download and add to shot” downloads the MP4 and returns its filename to that shot. Move the downloaded MP4 next to the edit plan before assembly. The association stays in the current browser tab; it is not a copy of the video in the storyboard.

The shot desk can choose each clip's starting point and volume, where to start within the music, and when the music begins in the video. The source media must be long enough for the chosen clip start and duration. A downloaded timeline manifest can also be edited directly. For example:

Export presets are `standard` (360p landscape/portrait, 480×480 square), `hd` (720p or 720×720), and `fullhd` (1080p or 1080×1080). Older plans default to `standard`. Higher output dimensions cannot recover detail missing from a low-resolution source and require more processing time.

Framing can be `fit` (show the entire source with black padding where needed) or `fill` (crop to fill the selected aspect ratio). Each shot can inherit the project setting or override it. For `fill`, each shot's horizontal and vertical position range from 0 (left/top) to 1 (right/bottom), defaulting to 0.5 (center). Older plans default to `fit`; review the crop before sharing.

Choose a local video in a shot to preview its approximate framing and selected time range in the browser. The file stays on the device and the selection is temporary: reopening the page requires selecting it again. The filename is saved in the storyboard, but the file must still be placed beside the downloaded edit plan. Browser rendering and FFmpeg can differ slightly.

    {"rights_confirmed":true,"aspect":"9:16","clips":[{"file":"opening.mp4","start":0.5,"seconds":2,"volume":0.9},{"file":"close.mp4","seconds":3}],"music":"own-track.wav","music_volume":0.35,"music_start":1.5,"music_delay":0.5,"subtitles":"captions.srt"}

Run `python tools/timeline.py cut.json master.mp4` from the checkout. All sources must be under the manifest directory. Use up to 30 clips / 180 seconds; aspect options 9:16, 16:9 or 1:1. Music and subtitles are optional. Output is H.264 with AAC and, if supplied, a selectable timed text track. No overwrite. FFmpeg/ffprobe must be on PATH. Captions can also carry timed titles. Music/film assembly does not perform beat detection or neural animation.

For local speech transcription, install an FFmpeg build with its whisper filter and obtain a whisper.cpp model. For this workstation, the verified MIT-licensed multilingual tiny model is at `C:/AI/downloads/karevia-whisper-tiny.bin`. Run `python tools/transcribe.py clip.mp4 captions.srt --model C:/AI/downloads/karevia-whisper-tiny.bin --language tr`. Review and correct the SRT text and timings before using it as the timeline's `subtitles` value. Recognition quality varies; the model runs on CPU and does not send audio to a server.

A larger multilingual base model is also available on this workstation at `C:/AI/downloads/karevia-whisper-base.bin` and can be selected by setting `STUDIO_WHISPER_MODEL` before starting the API. Both weights were verified against the upstream SHA-256. The base model still made a Turkish word-ending error on a synthetic test, so review remains necessary.

In the web AI Production screen, a completed caption job can be opened with “Edit captions”. Correct text and timing in the SRT editor, then download the edited file. “Save draft on this device” explicitly stores one draft in this browser, where it can be reopened or deleted even without a workstation connection. The server's original result is unchanged.
