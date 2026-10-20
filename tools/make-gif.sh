#!/bin/bash
# usage: mkgif.sh framesdir out.gif "a1 b1" "a2 b2" ...
set -e
src=$1; out=$2; shift 2
tmp=$(mktemp -d)
k=0
for r in "$@"; do set -- $r; for ((i=$1;i<=$2;i++)); do cp $src/f$(printf %05d $i).jpg $tmp/g$(printf %05d $k).jpg; k=$((k+1)); done; done
echo "frames $k = $(echo "scale=1;$k/30"|bc)s"
ffmpeg -loglevel error -y -framerate 30 -i $tmp/g%05d.jpg -vf "fps=12,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" $out
rm -rf $tmp
ls -la $out
