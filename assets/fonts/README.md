# Bundled font

`DejaVuSans.ttf` is shipped so libass always finds the watermark font (the
runtime container may have no system fonts). It is passed to ffmpeg via
`-vf subtitles=…:fontsdir=assets/fonts` and referenced by the family name
`DejaVu Sans` (configurable via `WM_FONT_NAME` / `WM_FONT_FILE`).

DejaVu Fonts are released under a permissive license (based on the Bitstream Vera
and Arev fonts licenses). See <https://dejavu-fonts.github.io/License.html>.
