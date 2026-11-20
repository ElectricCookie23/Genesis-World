# Audio report

Measured 2026-11-20 by `tool/audio-check.mjs`. **Numbers only: nobody has listened to any of these.** Levels are in dB relative to full scale. "Seam step" compares the jump from the last sample to the first with a typical sample-to-sample step (about 1 means the loop joins as smoothly as the sound itself; over about 5 risks a click). "Seam level" is the loudness of the last 50 ms against the first 50 ms. "Range" is the gap between loud and quiet passages (95th against 10th percentile of 0.4 s windows). "Zero-cross Hz" is a rough brightness figure.

## Generated ambience (`generated/ambience/`)

| File | Length | Level (RMS) | Peak | Clipped samples | Range | Brightness | Seam step | Seam level | Notes |
|---|---|---|---|---|---|---|---|---|---|
| cave-drips.wav | 40 s | -22.7 | -1.0 | 0 | 5.2 dB | 249 | 1.9 | 3.4 dB | level jumps at the seam |
| earthquake.wav | 14 s | -17.3 | -0.9 | 0 | 14.7 dB | 97 | – | – | one-shot |
| fire-crackle.wav | 40 s | -21.6 | -1.0 | 0 | 4.5 dB | 1042 | 0.9 | 0.7 dB |  |
| forest-birdsong.wav | 40 s | -20.0 | -1.2 | 0 | 23.3 dB | 2131 | 0.6 | -0.2 dB |  |
| lava-bubbling.wav | 40 s | -20.0 | -4.0 | 0 | 8.3 dB | 773 | 0.9 | -2.2 dB |  |
| music-calm-pad.wav | 96 s | -20.0 | -7.0 | 0 | 5 dB | 220 | 0.5 | 1.9 dB |  |
| night-crickets.wav | 40 s | -20.0 | -2.1 | 0 | 6.2 dB | 3010 | 0.1 | 2.2 dB |  |
| ocean-deep.wav | 40 s | -20.0 | -6.3 | 0 | 6.2 dB | 159 | 1.3 | -0.8 dB |  |
| rain-heavy.wav | 40 s | -20.0 | -4.7 | 0 | 0.4 dB | 9570 | 0.4 | 1.2 dB |  |
| rain-light.wav | 40 s | -20.6 | -1.0 | 0 | 1.5 dB | 10301 | 0.4 | 3.4 dB | level jumps at the seam |
| river-stream.wav | 40 s | -20.0 | -5.3 | 0 | 3.1 dB | 2981 | 1.1 | 2.7 dB |  |
| swamp-croaks.wav | 40 s | -20.0 | -2.6 | 0 | 22.7 dB | 206 | 1.5 | -0.3 dB |  |
| thunder-close.wav | 9 s | -24.6 | -0.9 | 0 | 39.5 dB | 247 | – | – | one-shot |
| thunder-distant.wav | 11 s | -23.6 | -4.4 | 0 | 54.9 dB | 82 | – | – | one-shot |
| underwater.wav | 40 s | -20.0 | -6.3 | 0 | 3.4 dB | 349 | 1.2 | -0.3 dB |  |
| waterfall.wav | 40 s | -20.0 | -5.6 | 0 | 0.7 dB | 3370 | 1.3 | -0.2 dB |  |
| waves-shore.wav | 48 s | -20.8 | -1.0 | 0 | 12.2 dB | 1804 | 1.6 | 0.3 dB |  |
| wind-gale.wav | 40 s | -20.0 | -3.5 | 0 | 9.5 dB | 1160 | 3.4 | 0.1 dB |  |
| wind-light.wav | 40 s | -20.0 | -5.9 | 0 | 2.6 dB | 592 | 0.5 | -0.5 dB |  |
| wind-strong.wav | 40 s | -20.0 | -5.0 | 0 | 4.1 dB | 866 | 0.7 | 0.5 dB |  |

Levels run from -24.6 to -17.3 dB, a spread of 7.3 dB: they would need matching before being mixed.

## Downloaded field recordings (`internet-archive/`): a sample

Up to three files per search term (the smallest over 600 kB), 66 decoded, 0 could not be decoded (mostly Ogg, which the macOS converter does not read). 494 files exist in total; the rest were not measured. A recording's folder is the word it was found under, which is not proof of what it contains.

| Found under | File | Size | Length | Level (RMS) | Peak | Clipped | Quiet share | Range | Notes |
|---|---|---|---|---|---|---|---|---|---|
| birds | aporee_44291_50369.mp3 | 1.4 MB | 60.8 s | -43.1 | -5.1 | 0 | 0% | 4.9 dB | very quiet |
| birds | aporee_13283_15518.mp3 | 1.6 MB | 66.2 s | -29.5 | -9.8 | 0 | 2% | 18.7 dB |  |
| birds | aporee_20173_23483.mp3 | 1.8 MB | 138.3 s | -27.9 | -8.6 | 0 | 5% | 21.4 dB |  |
| cave | aporee_24412_28334.mp3 | 1.5 MB | 61.9 s | -30.7 | -0.0 | 2 | 0% | 12.4 dB |  |
| cave | aporee_53565_61219.mp3 | 1.9 MB | 61.5 s | -48.0 | -7.5 | 0 | 0% | 13.9 dB | very quiet |
| cave | aporee_41525_47356.mp3 | 2.0 MB | 91 s | -38.2 | -12.2 | 0 | 0% | 12.6 dB |  |
| crickets | aporee_40573_46322.mp3 | 1.1 MB | 81 s | -56.8 | -38.7 | 0 | 0% | 4.8 dB | very quiet |
| crickets | aporee_30407_34994.mp3 | 1.8 MB | 72.1 s | -51.2 | -22.3 | 0 | 0% | 6.7 dB | very quiet |
| crickets | aporee_50831_57991.mp3 | 2.5 MB | 77.9 s | -38.0 | -19.8 | 0 | 3% | 4.5 dB |  |
| dawn_chorus | aporee_22466_26067.mp3 | 1.9 MB | 116.2 s | -25.0 | -0.4 | 0 | 9% | 27 dB | very uneven level |
| dawn_chorus | aporee_27839_32085.mp3 | 1.9 MB | 85.3 s | -36.6 | -15.2 | 0 | 2% | 14.2 dB |  |
| dawn_chorus | aporee_27840_32086.mp3 | 2.5 MB | 115.7 s | -32.9 | -11.0 | 0 | 1% | 14.1 dB |  |
| fire | aporee_29200_33600.mp3 | 1.5 MB | 97.3 s | -23.6 | -1.0 | 0 | 0% | 9.8 dB |  |
| fire | aporee_43754_49808.mp3 | 1.6 MB | 62.6 s | -17.6 | -1.3 | 0 | 3% | 22.8 dB |  |
| fire | aporee_14881_17352.mp3 | 1.8 MB | 134.2 s | -22.7 | -3.3 | 0 | 2% | 26.5 dB | very uneven level |
| forest | aporee_16979_19772.mp3 | 1.0 MB | 60.4 s | -20.7 | -3.0 | 0 | 0% | 5 dB |  |
| forest | aporee_41451_47281.mp3 | 2.0 MB | 151.4 s | -31.3 | -7.0 | 0 | 0% | 13.5 dB |  |
| forest | night-sounds-in-forest-d.-d.-teoli-jr.-a.-c. | 2.4 MB | 60.1 s | -31.4 | -13.7 | 0 | 0% | 4.3 dB |  |
| frogs | aporee_29901_34384.mp3 | 1.6 MB | 66.1 s | -25.0 | -6.0 | 0 | 0% | 8.3 dB |  |
| frogs | aporee_45613_51796.mp3 | 1.6 MB | 67.2 s | -41.6 | -14.6 | 0 | 2% | 23.3 dB | very quiet |
| frogs | aporee_13394_15635.mp3 | 2.5 MB | 62 s | -45.6 | -6.3 | 0 | 2% | 16.7 dB | very quiet |
| ice | aporee_66512_76968.mp3 | 1.4 MB | 60.1 s | -19.6 | -1.0 | 0 | 5% | 17.1 dB |  |
| ice | aporee_24934_28928.mp3 | 1.7 MB | 82.5 s | -22.6 | -0.0 | 1 | 2% | 6.7 dB |  |
| ice | aporee_21087_24506.mp3 | 2.8 MB | 173.9 s | -26.7 | -1.0 | 0 | 2% | 12.2 dB |  |
| insects | aporee_14490_16859.mp3 | 0.9 MB | 23.5 s | -24.4 | -6.5 | 0 | 0% | 8.9 dB |  |
| insects | aporee_45591_51773.mp3 | 1.6 MB | 70.2 s | -53.5 | -31.6 | 0 | 0% | 7.2 dB | very quiet |
| insects | aporee_43757_49811.mp3 | 1.7 MB | 76.4 s | -38.7 | -19.3 | 0 | 0% | 5.9 dB |  |
| jungle | aporee_55408_63311.mp3 | 2.0 MB | 80.4 s | -41.8 | -16.9 | 0 | 0% | 12.9 dB | very quiet |
| jungle | aporee_32947_37851.mp3 | 3.1 MB | 129.5 s | -17.1 | 0.0 | 3857 | 5% | 17.9 dB | clipping |
| jungle | aporee_70110_81663.mp3 | 11.7 MB | 497.8 s | -50.4 | -27.8 | 0 | 1% | 8.3 dB | very quiet |
| market | aporee_26641_30742.mp3 | 2.3 MB | 94.5 s | -32.9 | -8.7 | 0 | 0% | 10.5 dB |  |
| market | aporee_42103_47994.mp3 | 4.9 MB | 122.2 s | -25.4 | -3.0 | 0 | 0% | 12.2 dB |  |
| market | aporee_26864_30975.mp3 | 6.2 MB | 263.2 s | -29.7 | -5.2 | 0 | 0% | 19.1 dB |  |
| night | aporee_32534_37410.mp3 | 0.6 MB | 61.6 s | -26.8 | -2.4 | 0 | 14% | 44.9 dB | very uneven level |
| night | aporee_34701_39897.mp3 | 1.6 MB | 69 s | -30.7 | -12.5 | 0 | 1% | 3.1 dB |  |
| night | aporee_18915_21931.mp3 | 1.7 MB | 71.3 s | -27.6 | -0.3 | 0 | 0% | 10.6 dB |  |
| rain | thunder-and-rain-sounds-18-d.-d.-teoli-jr.-a | 2.4 MB | 150.9 s | -23.3 | 0.0 | 17 | 0% | 15.7 dB |  |
| rain | aporee_20698_24025.mp3 | 2.5 MB | 100.5 s | -27.8 | -0.1 | 1 | 0% | 12 dB |  |
| rain | aporee_22779_26437.mp3 | 3.4 MB | 84.5 s | -21.6 | -0.2 | 0 | 2% | 14 dB |  |
| river | aporee_14978_17451.mp3 | 1.2 MB | 50.9 s | -21.1 | -4.0 | 0 | 0% | 4.1 dB |  |
| river | aporee_37191_42600.mp3 | 1.5 MB | 76.4 s | -33.2 | -2.7 | 0 | 0% | 7.9 dB |  |
| river | aporee_26386_30476.mp3 | 2.3 MB | 105.1 s | -22.9 | -0.0 | 13 | 2% | 10.7 dB |  |
| sea | aporee_27299_31451.mp3 | 0.8 MB | 61.2 s | -26.5 | -8.3 | 0 | 0% | 12.7 dB |  |
| sea | aporee_18890_21904.mp3 | 1.4 MB | 34.9 s | -26.7 | -11.0 | 0 | 0% | 7.6 dB |  |
| sea | aporee_46523_52834.mp3 | 2.6 MB | 125.3 s | -56.4 | -36.7 | 0 | 0% | 10.6 dB | very quiet |
| storm | aporee_13278_15513.mp3 | 1.2 MB | 74 s | -30.9 | -9.8 | 0 | 1% | 23.6 dB |  |
| storm | aporee_12907_15128.mp3 | 2.6 MB | 64.3 s | -33.1 | -11.2 | 0 | 0% | 11.6 dB |  |
| storm | aporee_14240_16579.mp3 | 3.7 MB | 153.9 s | -32.0 | -0.5 | 0 | 1% | 19.7 dB |  |
| stream | aporee_24290_28198.mp3 | 1.1 MB | 73.9 s | -34.8 | -5.9 | 0 | 1% | 3.9 dB |  |
| stream | aporee_26411_30501.mp3 | 1.1 MB | 86.7 s | -20.9 | -1.2 | 0 | 2% | 6.1 dB |  |
| stream | aporee_27582_31800.mp3 | 1.8 MB | 66.3 s | -32.5 | -1.0 | 0 | 1% | 10.6 dB |  |
| thunder | aporee_31512_36206.mp3 | 1.6 MB | 79.6 s | -22.6 | -0.5 | 0 | 4% | 14.1 dB |  |
| thunder | aporee_17916_20821.mp3 | 2.9 MB | 98.8 s | -35.0 | -7.9 | 0 | 0% | 13.9 dB |  |
| thunder | aporee_27208_31355.mp3 | 3.8 MB | 95.1 s | -28.8 | -0.3 | 0 | 0% | 19.3 dB |  |
| volcano | aporee_21162_24586.mp3 | 3.8 MB | 94.4 s | -27.7 | -5.6 | 0 | 0% | 10.2 dB |  |
| volcano | aporee_27893_32148.mp3 | 5.3 MB | 181 s | -43.7 | -18.6 | 0 | 0% | 7.2 dB | very quiet |
| volcano | aporee_58757_67414.mp3 | 25.6 MB | 600.1 s | -13.5 | -0.4 | 0 | 0% | 17.4 dB |  |
| waterfall | aporee_36895_42278.mp3 | 0.9 MB | 65.2 s | -29.6 | -15.4 | 0 | 0% | 0.9 dB |  |
| waterfall | aporee_55561_63513.mp3 | 1.4 MB | 62.4 s | -27.4 | -10.3 | 0 | 0% | 0.8 dB |  |
| waterfall | aporee_52900_61447.mp3 | 1.6 MB | 71 s | -27.4 | -0.9 | 0 | 2% | 9.8 dB |  |
| waves | aporee_46560_52875.mp3 | 1.3 MB | 60.7 s | -38.1 | -9.9 | 0 | 0% | 12.6 dB |  |
| waves | aporee_25779_29843.mp3 | 2.8 MB | 68.7 s | -26.4 | -2.8 | 0 | 0% | 13.5 dB |  |
| waves | aporee_14785_17243.mp3 | 3.2 MB | 148 s | -24.4 | -1.6 | 0 | 0% | 6.5 dB |  |
| wind | aporee_12927_15151.mp3 | 2.0 MB | 113.5 s | -21.5 | -4.2 | 0 | 2% | 7.4 dB |  |
| wind | aporee_13694_15969.mp3 | 2.2 MB | 70 s | -33.7 | -14.4 | 0 | 0% | 12.5 dB |  |
| wind | wind-chimes-on-windy-day-d.-d.-teoli-jr..mp3 | 2.9 MB | 71.5 s | -20.9 | -0.0 | 16 | 0% | 14.5 dB |  |

50 of the 66 sampled recordings pass all the basic checks (30 s or longer, not clipped, not very quiet, steady level, few silences): birds, cave, crickets, dawn_chorus, fire, forest, frogs, ice, insects, market, night, rain, river, sea, storm, stream, thunder, volcano, waterfall, waves, wind.

None of the recordings is a prepared loop: each would need a section chosen, trimmed and cross-faded before use as ambience.
