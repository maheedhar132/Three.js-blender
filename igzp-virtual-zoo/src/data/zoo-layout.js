// =============================================================================
// Spatial layout of Indira Gandhi Zoological Park (IGZP), Visakhapatnam.
//
// SOURCE: the client-supplied illustrated visitor map (1200 x 800 px), which is
// also displayed on site (a photo of the on-site board was supplied). The map
// states: "This map has not been drawn to scale".
//
// All coordinates below are PIXEL positions on that map, traced by eye.
// They preserve relative placement, grouping and route connectivity only.
// They are NOT surveyed distances or GPS positions. Convert with toWorld().
//
// status values:
//   'mapped'        - shown on the official visitor map (presence of animals NOT verified)
//   'inferred'      - our reconstruction (e.g. assumed species, approximate route shape)
//   'restricted'    - shown on map but not a normal visitor area; not accessible here
// =============================================================================

export const MAP_SOURCE = {
  title: 'Visakhapatnam Zoo illustrated visitor map (supplied by client)',
  note: 'The map states it has not been drawn to scale.',
  area: '625 acres (as stated on the map)',
};

// Grey "Tar Road" layer (visitor-accessible circulation roads inside the zoo).
export const ROADS = [
  { id: 'north-east-loop', width: 7, status: 'mapped', pts: [[172, 196], [212, 180], [258, 160], [300, 140], [340, 124], [385, 117], [420, 128], [440, 150], [455, 186], [470, 226], [495, 262], [530, 282], [580, 292], [650, 293], [720, 292], [790, 294], [845, 300], [880, 318], [902, 345], [908, 385], [903, 430], [889, 475], [869, 520], [850, 548]] },
  { id: 'southern-road', width: 7, status: 'mapped', pts: [[176, 200], [192, 206], [205, 214], [216, 240], [228, 268], [250, 300], [285, 330], [330, 372], [380, 405], [430, 425], [485, 440], [545, 460], [590, 490], [625, 524], [665, 545], [720, 556], [780, 560], [830, 558], [850, 548]] },
  { id: 'sagar-gate-road', width: 7, status: 'mapped', pts: [[850, 548], [875, 576], [900, 606], [925, 641], [950, 680], [970, 712], [985, 733]] },
  { id: 'entrance-service-loop', width: 6, status: 'mapped', pts: [[172, 196], [148, 214], [120, 236], [98, 266], [108, 300], [148, 318], [190, 310], [214, 282], [228, 268]] },
  { id: 'entry-drive', width: 7, status: 'inferred', pts: [[150, 170], [160, 186], [170, 198]] },   // highway -> main gate
];

// Outside public highway (visual only, not walkable): "Visakhapatnam to Srikakulam".
export const HIGHWAY = { id: 'nh-vsp-srikakulam', width: 12, pts: [[-40, 300], [40, 245], [120, 192], [205, 128], [290, 60], [360, -10]] };

// Orange "Walking Path" layer (shapes approximate; connectivity follows the map).
export const PATHS = [
  { id: 'carnivore-trail', width: 4, status: 'mapped', pts: [[452, 54], [460, 95], [469, 135], [487, 170], [509, 205], [534, 238], [558, 263], [584, 288]] },
  { id: 'primates-trail', width: 4, status: 'mapped', pts: [[300, 140], [312, 112], [345, 92], [385, 96], [410, 110], [420, 128]] },
  { id: 'carnivore-link', width: 4, status: 'inferred', pts: [[420, 128], [436, 100], [452, 54]] },
  { id: 'herbivore-walk', width: 4, status: 'mapped', pts: [[228, 268], [240, 318], [262, 352], [300, 382], [345, 400], [392, 402], [440, 396], [484, 386], [515, 370]] },
  { id: 'lake-walk', width: 4, status: 'mapped', pts: [[515, 370], [538, 340], [562, 317], [584, 293]] },
  { id: 'zebra-giraffe-walk', width: 4, status: 'mapped', pts: [[214, 282], [200, 330], [205, 370], [228, 400], [268, 410], [300, 385]] },
  { id: 'deer-viewing-loop', width: 4, status: 'mapped', pts: [[650, 293], [640, 320], [660, 346], [700, 342], [720, 293]] },
  { id: 'butterfly-walk', width: 4, status: 'mapped', pts: [[845, 300], [830, 330], [825, 364], [845, 394], [875, 404], [904, 398]] },
  { id: 'reptile-croc-walk', width: 5, status: 'mapped', pts: [[908, 385], [930, 420], [950, 460], [966, 500], [976, 540], [986, 580], [1004, 620], [1014, 655], [1026, 685], [1006, 712], [988, 733]] },
  { id: 'lovebird-walk', width: 4, status: 'mapped', pts: [[625, 524], [640, 560], [670, 584], [720, 590], [760, 576], [780, 560]] },
  { id: 'reptile-house-link', width: 4, status: 'inferred', pts: [[869, 520], [895, 532], [922, 548], [950, 540], [966, 500]] },
  // Dedicated viewing access spurs connecting circulation routes to exhibit viewing verges
  { id: 'rhino-view-spur', width: 4.5, status: 'inferred', pts: [[228, 268], [242, 248], [248, 240]] },
  { id: 'leopard-view-spur', width: 4.5, status: 'inferred', pts: [[469, 135], [495, 132], [506, 131]] },
  { id: 'sun-bear-view-spur', width: 4.5, status: 'inferred', pts: [[862, 309], [872, 285], [878, 276]] },
  { id: 'sloth-bear-view-spur', width: 4.5, status: 'inferred', pts: [[880, 318], [902, 310], [908, 306]] },
  { id: 'hyena-east-view-spur', width: 4.5, status: 'inferred', pts: [[830, 330], [816, 328]] },
  { id: 'chimp-view-spur', width: 4.5, status: 'inferred', pts: [[436, 100], [426, 82], [420, 78]] },
  { id: 'hyena-north-view-spur', width: 4.5, status: 'inferred', pts: [[460, 95], [478, 96]] },
  { id: 'ostrich-view-spur', width: 4.5, status: 'inferred', pts: [[148, 318], [152, 298], [154, 290]] },
  { id: 'gaur-west-view-spur', width: 4.5, status: 'inferred', pts: [[345, 400], [346, 428], [348, 438]] },
  { id: 'swamp-deer-view-spur', width: 4.5, status: 'inferred', pts: [[392, 402], [398, 430], [402, 442]] },
  { id: 'hog-deer-view-spur', width: 4.5, status: 'inferred', pts: [[440, 396], [446, 430], [448, 448]] },
  { id: 'sambar-deer-view-spur', width: 4.5, status: 'inferred', pts: [[484, 386], [485, 430], [486, 460]] },
  { id: 'gaur-south-view-spur', width: 4.5, status: 'inferred', pts: [[545, 460], [536, 485], [530, 498]] },
  { id: 'wild-boar-view-spur', width: 4.5, status: 'inferred', pts: [[515, 370], [526, 390], [534, 400]] },
  { id: 'macaque-view-spur', width: 4.5, status: 'inferred', pts: [[300, 140], [290, 118], [286, 110]] },
  { id: 'parrot-view-spur', width: 4.5, status: 'inferred', pts: [[584, 288], [604, 276], [614, 272]] },
  { id: 'star-tortoise-view-spur', width: 4.5, status: 'inferred', pts: [[869, 520], [885, 512], [890, 510]] },
  { id: 'wolf-view-spur', width: 4.5, status: 'inferred', pts: [[825, 364], [812, 362]] },
  { id: 'lion-view-spur', width: 4.5, status: 'inferred', pts: [[708, 292], [702, 282]] },
  { id: 'bear-view-spur', width: 4.5, status: 'inferred', pts: [[826, 296], [828, 282]] },
  { id: 'crane-view-spur', width: 4.5, status: 'inferred', pts: [[284, 404], [290, 418]] },
  { id: 'elephant-view-spur', width: 5.0, status: 'inferred', pts: [[285, 330], [308, 300], [325, 284]] },
  { id: 'nilgai-view-spur', width: 4.5, status: 'inferred', pts: [[392, 402], [400, 398], [404, 396]] },
  { id: 'jackal-view-spur', width: 4.5, status: 'inferred', pts: [[880, 318], [868, 324], [860, 326]] },
  { id: 'blackbuck-view-spur', width: 4.5, status: 'inferred', pts: [[665, 545], [664, 540]] },
  { id: 'swan-view-spur', width: 4.5, status: 'inferred', pts: [[216, 240], [220, 234], [222, 232]] },
];

// Walkable plazas around gates and facilities.
export const PLAZAS = [
  { id: 'entrance-plaza', at: [170, 202], r: 18 },
  { id: 'entrance-forecourt', at: [152, 174], r: 8 },          // outside the gate, facing the nameboard wall
  { id: 'parking', at: [108, 246], r: 22, parking: true },
  { id: 'sagar-plaza', at: [984, 736], r: 12 },
  { id: 'canteen-plaza', at: [893, 366], r: 10 },
  { id: 'butterfly-plaza', at: [870, 398], r: 9 },
  { id: 'reptile-plaza', at: [920, 548], r: 9 },
  { id: 'souvenir-plaza', at: [760, 578], r: 9 },
  { id: 'aquarium-plaza', at: [206, 206], r: 8 },
];

// Blue "Waterbody" layer.
export const WATER = [
  { id: 'aquarium-stream', kind: 'stream', width: 9, pts: [[244, 192], [262, 212], [285, 240], [300, 275], [318, 305], [345, 340], [372, 368], [405, 381], [440, 378], [478, 368], [505, 352]] },
  { id: 'main-lake', kind: 'lake', lotus: [[790, 495], [770, 505], [805, 470]], pts: [[500, 345], [540, 325], [580, 322], [620, 344], [660, 368], [700, 389], [745, 401], [790, 420], [815, 446], [830, 480], [823, 514], [796, 530], [760, 522], [730, 496], [700, 466], [660, 440], [620, 415], [580, 396], [540, 386], [510, 372]] },
  { id: 'eastern-waterway', kind: 'stream', width: 10, pts: [[878, 426], [904, 460], [930, 500], [955, 545], [975, 590], [995, 630], [1015, 670], [1040, 705], [1075, 732], [1110, 750]] },
  { id: 'butterfly-pond', kind: 'pond', at: [855, 418], r: 6, lotus: [[855, 418]] },
];

export const HILLS = [
  { id: 'seethakonda-ne', name: 'Seethakonda Reserved Forest', at: [765, 160], rx: 215, ry: 92, rot: -0.12, h: 58 },
  { id: 'seethakonda-sw', name: 'Seethakonda Reserved Forest', at: [318, 568], rx: 205, ry: 72, rot: -0.08, h: 42 },
  { id: 'kambalakonda', name: 'Kambalakonda Wildlife Sanctuary', at: [10, 10], rx: 200, ry: 120, rot: 0.5, h: 75, outside: true },
];

export const ZONES = [
  { id: 'entrance', name: 'Main Entrance', at: [175, 225], r: 95 },
  { id: 'primates', name: 'Primates Zone', at: [340, 108], r: 110, sign: [338, 42] },
  { id: 'carnivores', name: 'Carnivores Section', at: [520, 175], r: 120, sign: [585, 206] },
  { id: 'herbivores', name: 'Herbivores Section', at: [390, 420], r: 190, sign: [420, 505] },
  { id: 'lion-deer', name: 'Lion & Deer Enclosures', at: [690, 300], r: 90 },
  { id: 'bears', name: 'Bear Section', at: [860, 300], r: 85, sign: [925, 256] },
  { id: 'butterfly', name: 'Butterfly Park & Canteen', at: [880, 395], r: 55 },
  { id: 'reptiles', name: 'Reptile House', at: [920, 500], r: 75, sign: [920, 552] },
  { id: 'lake', name: 'Lake & Lotus Pond', at: [680, 430], r: 150 },
  { id: 'south', name: 'Crocodile Ponds & Sagar Gate', at: [1000, 680], r: 100 },
];

// Exhibits. `r` = enclosure radius in map px (shape is generated organically and clipped
// away from paths/water automatically). `pool` adds water inside the enclosure.
// habitat: forest | rock | grass | dirt | water | aviary | pit | primate
export const EXHIBITS = [
  // --- Main entrance area
  { id: 'pelican', species: 'pelican', zone: 'entrance', at: [148, 238], r: 11, habitat: 'water', pool: [0, 0, 7], count: 3 },
  { id: 'swan', species: 'swan', zone: 'entrance', at: [226, 228], r: 10, habitat: 'water', pool: [0, 0, 7], waterLevel: 2.4, count: 2 },
  { id: 'rhino', species: 'rhino', zone: 'entrance', at: [254, 226], r: 17, habitat: 'dirt', pool: [4, 2, 6], count: 1 },
  { id: 'ostrich', species: 'ostrich', zone: 'entrance', at: [156, 278], r: 13, habitat: 'dirt', count: 2 },
  { id: 'emu', species: 'emu', zone: 'entrance', at: [190, 288], r: 10, habitat: 'dirt', count: 2 },
  { id: 'giant-squirrel', species: 'giant_squirrel', zone: 'entrance', at: [128, 262], r: 7, habitat: 'aviary', count: 2 },
  // --- Primates zone
  { id: 'sacred-baboon', species: 'hamadryas_baboon', zone: 'primates', at: [232, 160], r: 14, habitat: 'primate', count: 3 },
  { id: 'ring-tailed-lemur', species: 'ring_tailed_lemur', zone: 'primates', at: [268, 136], r: 11, habitat: 'primate', count: 3 },
  { id: 'bonnet-macaque', species: 'bonnet_macaque', zone: 'primates', at: [284, 96], r: 13, habitat: 'primate', count: 4 },
  { id: 'marmoset', species: 'marmoset', zone: 'primates', at: [330, 108], r: 8, habitat: 'aviary', count: 3 },
  { id: 'rhesus-macaque', species: 'rhesus_macaque', zone: 'primates', at: [340, 142], r: 12, habitat: 'primate', count: 4 },
  { id: 'stump-tailed-macaque', species: 'stump_tailed_macaque', zone: 'primates', at: [368, 80], r: 12, habitat: 'primate', count: 3 },
  { id: 'chimpanzee', species: 'chimpanzee', zone: 'primates', at: [418, 66], r: 17, habitat: 'primate', count: 2 },
  // --- Carnivores section
  { id: 'wild-dog-west', species: 'dhole', zone: 'carnivores', at: [424, 104], r: 13, habitat: 'forest', count: 3 },
  { id: 'wild-dog-north', species: 'dhole', zone: 'carnivores', at: [470, 64], r: 13, habitat: 'forest', count: 3 },
  { id: 'striped-hyena-north', species: 'striped_hyena', zone: 'carnivores', at: [492, 96], r: 13, habitat: 'dirt', count: 2 },
  { id: 'leopard', species: 'leopard', zone: 'carnivores', at: [522, 130], r: 15, habitat: 'rock', count: 1 },
  { id: 'bengal-tiger', species: 'bengal_tiger', zone: 'carnivores', at: [520, 184], r: 21, habitat: 'forest', pool: [-5, 4, 6], count: 2 },
  { id: 'birds-of-prey', species: 'birds_of_prey', zone: 'carnivores', at: [522, 232], r: 9, habitat: 'aviary', count: 2 },
  { id: 'white-tiger', species: 'white_tiger', zone: 'carnivores', at: [572, 256], r: 18, habitat: 'forest', pool: [4, -3, 5], count: 1 },
  { id: 'african-parrots', species: 'african_parrot', zone: 'carnivores', at: [622, 268], r: 8, habitat: 'aviary', count: 3 },
  // --- Lion, deer and small cats
  { id: 'lion', species: 'lion', zone: 'lion-deer', at: [700, 262], r: 20, habitat: 'grass', count: 2 },
  { id: 'small-cats', species: 'small_cat', zone: 'lion-deer', at: [772, 274], r: 11, habitat: 'forest', count: 2 },
  { id: 'sambar-spotted', species: 'sambar', species2: 'spotted_deer', zone: 'lion-deer', at: [670, 320], r: 20, habitat: 'grass', count: 4 },
  // --- Bear section and lesser carnivores
  { id: 'himalayan-black-bear', species: 'himalayan_black_bear', zone: 'bears', at: [830, 268], r: 15, habitat: 'rock', pool: [3, -3, 4], count: 1 },
  { id: 'malayan-sun-bear', species: 'sun_bear', zone: 'bears', at: [880, 262], r: 13, habitat: 'forest', count: 1 },
  { id: 'sloth-bear', species: 'sloth_bear', zone: 'bears', at: [918, 302], r: 15, habitat: 'rock', count: 2 },
  { id: 'striped-hyena-east', species: 'striped_hyena', zone: 'bears', at: [800, 326], r: 11, habitat: 'dirt', count: 1 },
  { id: 'jackal', species: 'golden_jackal', zone: 'bears', at: [856, 330], r: 10, habitat: 'dirt', count: 2 },
  { id: 'indian-grey-wolf', species: 'grey_wolf', zone: 'bears', at: [800, 360], r: 13, habitat: 'forest', count: 3 },
  // --- Butterfly / canteen area
  { id: 'hippopotamus', species: 'hippopotamus', zone: 'butterfly', at: [944, 408], r: 18, habitat: 'water', pool: [2, 2, 11], count: 1 },
  // --- Herbivores section
  { id: 'elephant', species: 'asian_elephant', zone: 'herbivores', at: [332, 238], r: 48, habitat: 'dirt', pool: [18, 14, 9], count: 2 },
  { id: 'zebra', species: 'zebra', zone: 'herbivores', at: [196, 356], r: 21, habitat: 'grass', count: 3 },
  { id: 'giraffe', species: 'giraffe', zone: 'herbivores', at: [254, 372], r: 22, habitat: 'grass', count: 2 },
  { id: 'sarus-crane', species: 'sarus_crane', species2: 'pheasant', zone: 'herbivores', at: [292, 430], r: 12, habitat: 'grass', pool: [3, 2, 4], count: 4 },
  { id: 'spotted-deer', species: 'spotted_deer', zone: 'herbivores', at: [340, 362], r: 20, habitat: 'grass', count: 6 },
  { id: 'nilgai', species: 'nilgai', zone: 'herbivores', at: [404, 378], r: 15, habitat: 'grass', count: 3 },
  { id: 'barking-deer', species: 'barking_deer', zone: 'herbivores', at: [455, 378], r: 12, habitat: 'forest', count: 2 },
  { id: 'indian-gaur-west', species: 'indian_gaur', zone: 'herbivores', at: [348, 458], r: 22, habitat: 'forest', count: 3 },
  { id: 'swamp-deer', species: 'swamp_deer', zone: 'herbivores', at: [404, 460], r: 16, habitat: 'grass', pool: [0, 3, 4], count: 3 },
  { id: 'hog-deer', species: 'hog_deer', zone: 'herbivores', at: [450, 464], r: 13, habitat: 'grass', count: 3 },
  { id: 'sambar-deer', species: 'sambar', zone: 'herbivores', at: [486, 478], r: 15, habitat: 'forest', count: 3 },
  { id: 'wild-boar', species: 'wild_boar', zone: 'herbivores', at: [538, 412], r: 14, habitat: 'dirt', count: 3 },
  { id: 'indian-gaur-south', species: 'indian_gaur', zone: 'herbivores', at: [528, 514], r: 21, habitat: 'forest', count: 2 },
  { id: 'blackbuck', species: 'blackbuck', zone: 'herbivores', at: [664, 512], r: 26, habitat: 'grass', count: 6 },
  { id: 'lovebirds', species: 'lovebird', zone: 'herbivores', at: [664, 574], r: 8, habitat: 'aviary', count: 6 },
  // --- Reptiles (map shows them grouped around the Reptile House)
  { id: 'rat-snake', species: 'rat_snake', zone: 'reptiles', at: [930, 436], r: 6, habitat: 'pit', count: 1 },
  { id: 'indian-cobra', species: 'indian_cobra', zone: 'reptiles', at: [902, 470], r: 6, habitat: 'pit', count: 1 },
  { id: 'rock-python', species: 'rock_python', zone: 'reptiles', at: [960, 462], r: 7, habitat: 'pit', count: 1 },
  { id: 'star-tortoise', species: 'star_tortoise', zone: 'reptiles', at: [898, 506], r: 6, habitat: 'pit', count: 3 },
  { id: 'water-monitor', species: 'water_monitor', zone: 'reptiles', at: [960, 494], r: 7, habitat: 'pit', pool: [1, 1, 3], count: 1 },
  { id: 'terrapin-softshell', species: 'terrapin', zone: 'reptiles', at: [944, 520], r: 7, habitat: 'water', pool: [0, 0, 5], count: 3 },
  { id: 'green-iguana', species: 'green_iguana', zone: 'reptiles', at: [870, 522], r: 6, habitat: 'pit', count: 1 },
  { id: 'bengal-monitor', species: 'bengal_monitor', zone: 'reptiles', at: [882, 560], r: 7, habitat: 'pit', count: 1 },
  // --- Crocodilians and southern waterways
  { id: 'marsh-crocodile', species: 'mugger', zone: 'south', at: [1036, 640], r: 21, habitat: 'water', pool: [4, 0, 15], count: 3 },
  { id: 'saltwater-crocodile', species: 'saltwater_crocodile', zone: 'south', at: [1048, 692], r: 19, habitat: 'water', pool: [4, 2, 13], count: 1 },
  { id: 'gharial', species: 'gharial', zone: 'south', at: [956, 716], r: 16, habitat: 'water', pool: [-3, 0, 11], count: 2 },
];

// Buildings and landmarks. `name` is shown on signs / the map.
export const BUILDINGS = [
  { id: 'main-entry', kind: 'gate', name: 'Main Entry', at: [160, 186], rot: 0.52, status: 'mapped' },
  { id: 'ticket-counter', kind: 'ticket', name: 'Tickets', at: [140, 204], status: 'mapped' },
  { id: 'asst-curator', kind: 'office', name: 'Assistant Curator Offices 1 & 2', at: [198, 150], status: 'mapped', restricted: true },
  { id: 'curator', kind: 'office', name: 'Curator Office', at: [86, 262], status: 'mapped', restricted: true },
  { id: 'bov-shed', kind: 'shed', name: 'BOV Shed', at: [82, 292], status: 'mapped', restricted: true },
  { id: 'vet-hospital', kind: 'hospital', name: 'Veterinary Hospital', at: [96, 332], status: 'mapped', restricted: true },
  { id: 'store', kind: 'office', name: 'Store', at: [146, 340], status: 'mapped', restricted: true },
  { id: 'aquarium', kind: 'aquarium', name: 'Aquarium', at: [206, 214], status: 'mapped' },
  { id: 'nocturnal-house', kind: 'house', name: 'Nocturnal Animal House', at: [214, 312], status: 'mapped' },
  { id: 'butterfly-rearing', kind: 'house', name: 'Butterfly Rearing Centre', at: [808, 398], status: 'mapped' },
  { id: 'butterfly-park', kind: 'garden', name: 'Butterfly Park', at: [870, 404], status: 'mapped' },
  { id: 'bioscope', kind: 'house', name: 'Bioscope', at: [930, 382], status: 'mapped' },
  { id: 'canteen', kind: 'canteen', name: 'Canteen', at: [896, 358], status: 'mapped' },
  { id: 'reptile-house', kind: 'house', name: 'Reptile House', at: [922, 540], status: 'mapped' },
  { id: 'souvenir', kind: 'shop', name: 'Souvenir Shop & Outreach Centre', at: [760, 586], status: 'mapped' },
  { id: 'sagar-gate', kind: 'gate', name: 'Sagar Gate', at: [990, 742], rot: 0.62, status: 'mapped' },
];

// Small amenities shown by legend icons (positions approximate).
export const AMENITIES = [
  { kind: 'toilet', at: [262, 152] }, { kind: 'toilet', at: [402, 176] }, { kind: 'toilet', at: [232, 322] },
  { kind: 'toilet', at: [512, 297] }, { kind: 'toilet', at: [742, 300] }, { kind: 'toilet', at: [495, 437] },
  { kind: 'toilet', at: [860, 545] }, { kind: 'toilet', at: [918, 404] },
  { kind: 'ro', at: [190, 214] }, { kind: 'ro', at: [598, 292] }, { kind: 'ro', at: [900, 330] }, { kind: 'ro', at: [960, 620] },
  { kind: 'pagoda', at: [282, 268] }, { kind: 'pagoda', at: [278, 456] }, { kind: 'pagoda', at: [420, 438] },
  { kind: 'pagoda', at: [606, 492] }, { kind: 'pagoda', at: [742, 548] }, { kind: 'pagoda', at: [848, 516] },
  { kind: 'pagoda', at: [912, 418] }, { kind: 'pagoda', at: [935, 686] }, { kind: 'pagoda', at: [548, 300] },
  { kind: 'icecream', at: [792, 574] }, { kind: 'icecream', at: [930, 690] },
  { kind: 'souvenir', at: [370, 412] },
];

// Shown on the map but not normal visitor areas: drawn, never accessible.
export const RESTRICTED = [
  { id: 'wild-dog-breeding', name: 'Wild Dog Breeding Centre', at: [1030, 180], r: 38, status: 'restricted' },
  { id: 'fodder-area', name: 'Fodder Area', at: [1078, 60], r: 26, status: 'restricted' },
];

// Guided tour order (exhibit or building ids). Follows the mapped circulation from Main Entry to Sagar Gate.
export const GUIDED_TOUR = [
  'rhino', 'sacred-baboon', 'chimpanzee', 'bengal-tiger', 'white-tiger', 'lion',
  'himalayan-black-bear', 'sloth-bear', 'butterfly-park', 'hippopotamus', 'reptile-house',
  'marsh-crocodile', 'gharial', 'sagar-gate',
];
