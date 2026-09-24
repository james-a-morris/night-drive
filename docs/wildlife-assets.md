# Wildlife models

The deer, stag, fox, and wolf are from **Quaternius — Ultimate Animated Animal
Pack**, released under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

- Creator and original pack: https://quaternius.com/packs/ultimateanimatedanimals.html
- Creator's licensing FAQ: https://quaternius.com/faq.html
- Public source mirror used for these files:
  https://github.com/xxfrigorizxx/The-Legacy-Of-Seroka/tree/a3aaca61260eee91a1ffb05904b90b03094d829d/_tmp_quaternius_animals
- The mirror includes the original `License.txt` naming Quaternius and CC0.

The original `glTF/Deer.gltf`, `Stag.gltf`, `Fox.gltf`, and `Wolf.gltf` were
converted to self-contained binary glTF files in `public/assets/wildlife-*.glb`.
Only `Idle`, `Idle_2`, `Eating`, `Walk`, and `Gallop` animations are retained; unused animation
accessors and buffer views were removed. Geometry, skin weights, skeletons,
colors, and the retained animation data are unchanged. The four local files
total about 4.5 MiB and require no runtime connection to the asset mirror.

Night Rail shares geometry between instances, clones each skeleton, and uses
different animation phases. Materials are made matte at runtime; each species
is scaled to fit the landscape. Animals alternate between walking, short trots,
looking around, and grazing, with eased movement and animation crossfades.
Their paths stay inside the clearing, and their bodies and shadows follow the
terrain. Birds alternate quicker wingbeats with gliding and individual banking.
No aggressive or death animations are used. Reduced motion freezes these movements.

## Ocean animals

Pacific Coast uses all seven species from the
[Quaternius Animated Fish Pack](https://quaternius.com/packs/animatedfish.html),
also released under CC0: dolphin, whale, shark, manta ray, and three small fish.
The FBX originals came directly from the creator's
[public download folder](https://drive.google.com/drive/folders/1L8ovz6ZM1btyW30ZZvf2cZe1GU5_Q_CG).

`Dolphin.fbx`, `Whale.fbx`, `Shark.fbx`, `Manta ray.fbx`, and `Fish1.fbx` through
`Fish3.fbx` were converted with Three.js 0.180's FBXLoader and GLTFExporter to
the self-contained `public/assets/ocean-*.glb` files (about 0.92 MiB total).
The swim animations and diffuse colors are retained. Materials use matte PBR
shading; the importer retains and normalizes the four strongest skin weights
per vertex. No external textures or runtime asset service are required.

Each swimmer has its own skeleton and animation phase. Models load when coastal
water first comes into range. Swimming paths follow the shoreline, remain above
the seabed, and recycle behind the train. Submerged silhouettes show through
nearshore water. Stroke speeds vary with swimming bursts, animals bank into turns,
and dolphins occasionally make small leaps with trailing surface ripples.
Reduced-motion preferences freeze swimming, surfacing, ripples, and wave motion,
and keep dolphins in the water instead of suspended during a leap.
