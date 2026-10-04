# Brand

`icon.svg` is the source: a roof over four rounded rooms - Casora builds a
home room by room, and the mark says so. Roof and rooms are set in Casora's Ton
(#A86E45), one room is lit in honey (#E8B04A), like a window with the light on.
`dark_icon.svg` is the same mark in a lighter Ton (#D9A27A) for dark
backgrounds. There is no tile behind it - the mark is transparent throughout,
so it sits among Home Assistant's other integration icons rather than on a
square of its own.

Geometry worth keeping: the roof is one stroke of 56 with round caps and join;
the rooms are 104 x 96 with a radius of 26 and gaps of 28 and 16, so the grid
reads as four tiles even at 32 px. The viewBox is trimmed hard to the artwork,
so the eaves meet the left and right edges and the mark is centered
vertically - home-assistant/brands wants an icon cropped to its content.

The PNGs Home Assistant and HACS read live in `custom_components/casora/brand/`,
at 256 and 512 square with a transparent background.

To regenerate after editing the SVG, render each size natively rather than
downscaling:

```
chrome --headless=new --default-background-color=00000000 \
       --window-size=512,512 --screenshot=icon@2x.png icon.svg
# then the same with width/height 256 on the <svg> element and --window-size=256,256
```
