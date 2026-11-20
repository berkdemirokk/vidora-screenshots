import json
import tempfile
import unittest
import array
from unittest.mock import patch
from pathlib import Path
from timeline import render, run, trim_srt, probe


class RealEdit(unittest.TestCase):
    def test_crop_position_selects_left_or_right(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)
            run(["ffmpeg","-v","error","-f","lavfi","-i","color=red:size=320x180:rate=24,drawbox=x=160:y=0:w=160:h=180:color=blue:t=fill","-t","0.5","-c:v","libx264",str(p/"clip.mp4")])
            plan={"rights_confirmed":True,"aspect":"9:16","framing":"fill","clips":[{"file":"clip.mp4","seconds":.4}]}
            manifest=p/"plan.json"
            for name,x in (("left",0),("right",1)):
                plan["clips"][0]["crop_x"]=x
                manifest.write_text(json.dumps(plan))
                render(manifest,p/(name+".mp4"))
            def pixel(name):
                return run(["ffmpeg","-v","error","-i",str(p/(name+".mp4")),"-vf","crop=2:2:180:320,format=rgb24","-frames:v","1","-f","rawvideo","-"])[0:3]
            self.assertGreater(pixel("left")[0],180)
            self.assertGreater(pixel("right")[2],180)

    def test_fit_and_fill_framing(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)
            run(["ffmpeg","-v","error","-f","lavfi","-i","color=red:size=320x180:rate=24","-t","0.5","-c:v","libx264",str(p/"clip.mp4")])
            plan={"rights_confirmed":True,"aspect":"9:16","clips":[{"file":"clip.mp4","seconds":.4}]}
            manifest=p/"plan.json"
            for framing in ("fit","fill"):
                plan["framing"]=framing
                manifest.write_text(json.dumps(plan))
                render(manifest,p/(framing+".mp4"))
            def top_pixel(name):
                return run(["ffmpeg","-v","error","-i",str(p/(name+".mp4")),"-vf","crop=2:2:180:30,format=rgb24","-frames:v","1","-f","rawvideo","-"])[0:3]
            self.assertLess(max(top_pixel("fit")),20)
            self.assertGreater(top_pixel("fill")[0],180)
            plan["framing"]="fit"
            plan["clips"][0]["framing"]="fill"
            manifest.write_text(json.dumps(plan))
            render(manifest,p/"override.mp4")
            self.assertGreater(top_pixel("override")[0],180)

    def test_hd_export_dimensions(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)
            run(["ffmpeg","-v","error","-f","lavfi","-i","testsrc2=size=320x180:rate=24","-t","0.5","-c:v","libx264",str(p/"clip.mp4")])
            manifest=p/"plan.json"
            manifest.write_text(json.dumps({"rights_confirmed":True,"aspect":"9:16","resolution":"hd","clips":[{"file":"clip.mp4","seconds":.4}]}))
            render(manifest,p/"out.mp4")
            video=next(s for s in probe(p/"out.mp4")["streams"] if s["codec_type"]=="video")
            self.assertEqual((video["width"],video["height"]),(720,1280))
            manifest.write_text(json.dumps({"rights_confirmed":True,"aspect":"16:9","resolution":"fullhd","clips":[{"file":"clip.mp4","seconds":.4}]}))
            render(manifest,p/"fullhd.mp4")
            video=next(s for s in probe(p/"fullhd.mp4")["streams"] if s["codec_type"]=="video")
            self.assertEqual((video["width"],video["height"]),(1920,1080))

    def test_invalid_later_shot_fails_before_encoding(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=24", "-t", "1", "-c:v", "libx264", str(p/"clip.mp4")])
            plan = {"rights_confirmed": True, "aspect": "16:9", "clips": [
                {"file": "clip.mp4", "seconds": .5},
                {"file": "clip.mp4", "start": .8, "seconds": .5},
            ]}
            manifest = p/"plan.json"
            manifest.write_text(json.dumps(plan))
            with patch("timeline.run", wraps=run) as executed:
                with self.assertRaisesRegex(ValueError, "Shot 2"):
                    render(manifest, p/"output.mp4")
                self.assertTrue(all(call.args[0][0] != "ffmpeg" for call in executed.call_args_list))
            self.assertFalse((p/"output.mp4").exists())

    def test_subtitle_cues_are_clipped_at_timeline_end(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            source = p / "input.srt"
            output = p / "clipped.srt"
            source.write_text(
                "1\n00:00:00,100 --> 00:00:02,400\nHello\n\n"
                "2\n00:00:03,000 --> 00:00:04,000\nLater\n",
                encoding="utf-8",
            )
            self.assertTrue(trim_srt(source, output, 2))
            text = output.read_text(encoding="utf-8")
            self.assertIn("00:00:00,100 --> 00:00:02,000", text)
            self.assertNotIn("Later", text)
            self.assertFalse(trim_srt(source, p / "empty.srt", 0.05))

    def test_cut_music_subtitles_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)
            ff=["ffmpeg","-nostdin","-loglevel","error","-f","lavfi","-i"]
            run(ff+["testsrc2=size=320x180:rate=24","-t","1","-c:v","libx264",str(p/"clip.mp4")])
            run(ff+["sine=frequency=440","-t","1",str(p/"bed.wav")])
            (p/"title.srt").write_text("1\n00:00:00,100 --> 00:00:00,800\nKarevia Studio\n",encoding="utf-8")
            plan={"rights_confirmed": True,"aspect":"9:16","clips":[{"file":"clip.mp4","start":.15,"seconds":.5},
                {"file":"clip.mp4","start":.33,"seconds":.5}],"music":"bed.wav","music_start":.1,"music_delay":.25,"subtitles":"title.srt"}
            f=p/"cut.json"
            f.write_text(json.dumps(plan))
            dest=p/"result.mp4"
            result=render(f,dest)
            self.assertEqual(result["streams"],["h264","aac","mov_text"])
            pcm=run(["ffmpeg","-v","error","-i",str(dest),"-map","0:a:0","-ac","1","-ar","48000","-f","s16le","-"])
            samples=array.array("h",pcm)
            self.assertLess(max(abs(v) for v in samples[2000:8000]), 200)
            self.assertGreater(max(abs(v) for v in samples[20000:28000]), 300)
            plan["music_start"] = 2
            f.write_text(json.dumps(plan))
            with self.assertRaises(ValueError):
                render(f, p/"invalid.mp4")
            frames=run(["ffmpeg","-v","error","-i",str(dest),"-map","0:v:0","-f","framemd5","-"])
            rows=[r for r in frames.splitlines() if not r.startswith(b"#")]
            self.assertGreaterEqual(len(rows),23)
            self.assertGreater(len(set(r.split(b",")[-1] for r in rows)),10)
            with self.assertRaises(ValueError):
                render(f,dest)


if __name__=="__main__":
    unittest.main()
