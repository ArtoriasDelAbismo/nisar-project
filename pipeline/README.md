# NISAR pipeline

Turns real NISAR GCOV products into the measurements and overlays the app shows. It reads only the
chunks covering each region, so a pass costs far less than the ~1.8 GB product.

## Setup

1. Create `~/.netrc` with your [Earthdata Login](https://urs.earthdata.nasa.gov):

   ```
   machine urs.earthdata.nasa.gov
       login YOUR_USERNAME
       password YOUR_PASSWORD
   ```

   Then run `chmod 600 ~/.netrc`.

2. Install:

   ```sh
   python3 -m venv pipeline/.venv
   pipeline/.venv/bin/pip install -r pipeline/requirements.txt
   ```

## Run

```sh
npm run nisar:sectors                 # after any change to the sector generators
cd pipeline
.venv/bin/python -m nisar_pipeline.run --region gaza --passes 8
.venv/bin/python -m pytest
```

Output goes to `public/data/nisar/<region>/`: `index.json`, plus backscatter and change PNGs.

## Method

- Passes are only compared within one stack: same track, frame, direction, mode and polarization.
- Only `PROVISIONAL` products are used, because `BETA` used different processing.
- Pixels are valid when `mask` is 1 to 5.
- Change is the difference between passes in dB after 3x3 smoothing to reduce speckle. A pixel
  counts as changed at 3 dB or more.
- Each pair's scene-wide median shift is removed, so a sector's values describe local change. A
  shift above 2 dB means a faulty pass, and that pair isn't compared at all.
- Sectors with under 50% valid pixels report nothing.
- Open sea is masked from change in Gaza with a coastline polygon, because wind changes its
  brightness between passes. The polygon sits about 400 m offshore, so a thin strip of false change
  can remain along the shore.

Backscatter change shows that the surface changed, not what changed. Rain, soil moisture and crops
also change it, so treat results as prompts for review rather than confirmed structure change.

Checked on real Gaza data, Aug-Oct 2026: stable pairs show about 0.8 dB of noise over land and sea
combined, and tracks 151 and 100 agree on flagged pixels about 20-50x more often than chance. Most
flagged pixels are still seen by one track only.
