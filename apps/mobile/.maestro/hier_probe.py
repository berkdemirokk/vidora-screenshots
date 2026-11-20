"""Print the name-field focus facts from a Maestro screen-hierarchy JSON.

usage: python3 hier_probe.py <hierarchy.json> <label>
Output: "Name focus after <label>: focused=<..> bitti=<..> field=<bounds> tool-text=<bounds>"
"""
import json
import sys


def walk(node, out):
    attrs = node.get("attributes", {})
    out.append(attrs)
    for child in node.get("children", []):
        walk(child, out)


try:
    with open(sys.argv[1], encoding="utf-8") as fh:
        tree = json.load(fh)
    nodes = []
    walk(tree, nodes)

    def rid(a):
        return a.get("resource-id", "")

    field = next((a for a in nodes if rid(a) == "field-headline"), None)
    tool = next((a for a in nodes if rid(a) == "tool-text"), None)
    bitti = any("Bitti" in str(a.get("text", "")) or "Bitti" in str(a.get("accessibilityText", "")) for a in nodes)
    print(
        "Name focus after %s: focused=%s bitti=%s field=%s tool-text=%s"
        % (
            sys.argv[2],
            field.get("focused") if field else "no-field",
            bitti,
            field.get("bounds") if field else "-",
            tool.get("bounds") if tool else "-",
        )
    )
except Exception as exc:  # the summary must never fail the job
    print("Name focus after %s: probe failed (%s)" % (sys.argv[2], exc))
