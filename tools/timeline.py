"""Assemble rights-cleared local clips and optional soundtrack/subtitles, atomically."""
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

RATIOS = {"9:16":(360,640),"16:9":(640,360),"1:1":(480,480)}
EXPORT_SIZES = {
    "standard": RATIOS,
    "hd": {"9:16":(720,1280),"16:9":(1280,720),"1:1":(720,720)},
    "fullhd": {"9:16":(1080,1920),"16:9":(1920,1080),"1:1":(1080,1080)},
}


def number(n, lo, hi):
    if type(n) not in (float,int) or not math.isfinite(n) or not lo <= n <= hi:
        raise ValueError("Invalid timeline number")
    return float(n)


def run(args, seconds=240):
    # No interactive reads, shells, remote URLs, playlists or media-specified network access.
    p=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=seconds)
    if p.returncode:
        raise ValueError("Media command failed: "+p.stderr.decode(errors="replace")[-700:])
    return p.stdout


def source(parent,name,ext):
    if not isinstance(name,str) or not name or Path(name).is_absolute():
        raise ValueError("Use a relative file within the manifest directory")
    path=(parent/name).resolve(strict=True)
    if not path.is_relative_to(parent) or not path.is_file() or path.suffix.lower() not in ext:
        raise ValueError("Unsupported or external source")
    return path


def probe(path):
    return json.loads(run(["ffprobe","-v","error","-protocol_whitelist","file",
        "-show_streams","-show_format","-of","json",str(path)]))


def input_args(path):
    return ["-protocol_whitelist","file","-i",str(path)]

def trim_srt(path, output, duration):
    """Clip SRT cue ends to the timeline, and discard cues starting after it."""
    if path.stat().st_size > 2_000_000:
        raise ValueError("Subtitle file exceeds 2 MB")
    content = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    timing = re.compile(r"^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})(.*)$")
    limit = round(duration * 1000)
    cues = []
    for block in re.split(r"\n\s*\n", content.strip()):
        lines = block.splitlines()
        if not lines:
            continue
        pos = 0 if "-->" in lines[0] else 1
        match = timing.fullmatch(lines[pos]) if pos < len(lines) else None
        if not match or len(lines) <= pos + 1:
            raise ValueError("Invalid SRT subtitle cue")
        values = list(map(int, match.groups()[:8]))
        if values[1] > 59 or values[2] > 59 or values[5] > 59 or values[6] > 59:
            raise ValueError("Invalid SRT timestamp")
        start = ((values[0]*60+values[1])*60+values[2])*1000+values[3]
        end = ((values[4]*60+values[5])*60+values[6])*1000+values[7]
        if end <= start:
            raise ValueError("Invalid SRT cue duration")
        if start >= limit:
            continue
        end = min(end, limit)
        def stamp(value):
            hours, value = divmod(value, 3600000)
            minutes, value = divmod(value, 60000)
            seconds, ms = divmod(value, 1000)
            return f"{hours:02}:{minutes:02}:{seconds:02},{ms:03}"
        cues.append(f"{len(cues)+1}\n{stamp(start)} --> {stamp(end)}{match.group(9)}\n" + "\n".join(lines[pos+1:]))
    if cues:
        output.write_text("\n\n".join(cues) + "\n", encoding="utf-8")
    return bool(cues)


def render(manifest, destination):
    base=manifest.resolve().parent
    if manifest.stat().st_size>128000:
        raise ValueError("Oversized manifest")
    plan=json.loads(manifest.read_text(encoding="utf-8-sig"))
    if plan.get("rights_confirmed") is not True:
        raise ValueError("Confirm ownership or authorization for all supplied media")
    preset=plan.get("resolution", "standard")
    if preset not in EXPORT_SIZES or plan.get("aspect") not in RATIOS:
        raise ValueError("Unsupported output resolution or aspect ratio")
    framing=plan.get("framing", "fit")
    if framing not in {"fit", "fill"}:
        raise ValueError("Unsupported framing mode")
    size=EXPORT_SIZES[preset][plan["aspect"]]
    clips=plan["clips"]
    if not isinstance(clips,list) or not 1<=len(clips)<=30:
        raise ValueError("Supply 1–30 clips")
    if destination.suffix.lower()!=".mp4" or destination.exists():
        raise ValueError("Use a new MP4 path")
    total=0
    checked=[]
    # Inspect every clip before rendering so a late invalid shot does not waste
    # minutes of work on earlier ones. Keep the scene number in diagnostics.
    for i,c in enumerate(clips):
        try:
            path=source(base,c["file"],{".mp4",".mov",".m4v"})
            info=probe(path)
            if not any(s.get("codec_type")=="video" for s in info["streams"]):
                raise ValueError("Clip needs a video stream")
            duration=float(info["format"]["duration"])
            try:
                start=number(c.get("start",0),0,duration)
                length=number(c["seconds"],.1,min(duration-start+.025,60))
            except ValueError as exc:
                raise ValueError(f"Start and length exceed the {duration:.2f}s source or allowed limits") from exc
            volume=number(c.get("volume",1),0,2)
            shot_framing=c.get("framing",framing)
            if shot_framing not in {"fit","fill"}:
                raise ValueError("Unsupported shot framing mode")
            crop_x=number(c.get("crop_x",.5),0,1)
            crop_y=number(c.get("crop_y",.5),0,1)
            total+=length
            if total>180:
                raise ValueError("Timeline exceeds 180 s")
            checked.append((path,info,start,length,volume,shot_framing,crop_x,crop_y))
        except (ValueError, KeyError, TypeError, OSError) as exc:
            raise ValueError(f"Shot {i+1}: {exc}") from exc
    music_settings=None
    if "music" in plan:
        music=source(base,plan["music"],{".m4a",".wav",".mp3",".aac",".flac"})
        info=probe(music)
        if not any(s.get("codec_type")=="audio" for s in info["streams"]):
            raise ValueError("Music needs an audio stream")
        duration=float(info["format"]["duration"])
        offset=number(plan.get("music_start",0),0,min(duration,3600))
        if offset>=duration:
            raise ValueError("Music start must precede the end of the track")
        delay=number(plan.get("music_delay",0),0,total)
        music_settings=(music,offset,delay,number(plan.get("music_volume",.5),0,2))
    subtitles=source(base,plan["subtitles"],{".srt"}) if "subtitles" in plan else None
    ff=["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-n"]
    destination.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as work:
        workspace=Path(work).resolve()
        sub=None
        if subtitles:
            clipped=workspace/"captions.srt"
            sub=clipped if trim_srt(subtitles,clipped,total) else None
        for i,(path,info,start,length,volume,shot_framing,crop_x,crop_y) in enumerate(checked):
            w,h=size
            if shot_framing=="fill":
                vf=f"scale={w}:{h}:force_original_aspect_ratio=increase:force_divisible_by=2,crop={w}:{h}:(iw-ow)*{crop_x}:(ih-oh)*{crop_y},setsar=1,fps=24"
            else:
                vf=f"scale={w}:{h}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24"
            args=["-ss",str(start)]+input_args(path)
            audio=any(s["codec_type"]=="audio" for s in info["streams"])
            if not audio:
                args+=["-f","lavfi","-i","anullsrc=r=48000:cl=stereo"]
            run(ff+args+["-t",str(length),"-map","0:v:0","-map","0:a:0" if audio else "1:a:0","-vf",vf,
                "-af",f"volume={volume},apad","-c:a","aac","-ac","2","-ar","48000",
                "-pix_fmt","yuv420p","-c:v","libx264","-preset","veryfast",str(workspace/f"{i}.mp4")])
        listing=workspace/"list.txt"
        listing.write_text("".join(f"file '{i}.mp4'\n" for i in range(len(clips))),encoding="ascii")
        args=ff+["-f","concat","-safe","1"]+input_args(listing)
        amap="0:a:0"
        if music_settings:
            music,offset,delay,music_volume=music_settings
            args+=["-ss",str(offset)]+input_args(music)+["-filter_complex",
                f"[1:a]asetpts=PTS-STARTPTS,volume={music_volume},adelay={round(delay*1000)}:all=1[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]"]
            amap="[a]"
        if sub:
            args+=input_args(sub)
        args+=["-map","0:v:0","-map",amap]
        if sub:
            args+=["-map",("2" if "music" in plan else "1")+":s:0","-c:s","mov_text"]
        out=workspace/"master.mp4"
        run(args+["-c:v","copy","-c:a","aac","-movflags","+faststart","-t",str(total),str(out)])
        details=probe(out)
        if abs(float(details["format"]["duration"])-total)>.20 or not any(
                s.get("codec_name")=="h264" for s in details["streams"]):
            raise ValueError("Export failed duration/codec validation")
        # Hard-link atomically without clobbering if another process won the destination.
        os.link(out,destination)
        return {"seconds":float(details["format"]["duration"]),"bytes":out.stat().st_size,
                "streams":[s["codec_name"] for s in details["streams"]]}


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest",type=Path)
    parser.add_argument("output",type=Path)
    args=parser.parse_args()
    print(json.dumps(render(args.manifest,args.output)))
