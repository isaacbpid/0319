export const VEHICLE_MAKES: string[] = [
  'Abarth',
  'Acura',
  'Alfa Romeo',
  'Alpine',
  'Aston Martin',
  'Audi',
  'Avatr',
  'BAIC',
  'Baojun',
  'Bentley',
  'Bestune',
  'BMW',
  'Bugatti',
  'Buick',
  'BYD',
  'Cadillac',
  'Changan',
  'Chery',
  'Chevrolet',
  'Chrysler',
  'Citroen',
  'Cupra',
  'Dacia',
  'Daihatsu',
  'Deepal',
  'Denza',
  'Dodge',
  'Dongfeng',
  'DS',
  'FAW',
  'Ferrari',
  'Fiat',
  'Ford',
  'GAC',
  'Geely',
  'Genesis',
  'GMC',
  'Great Wall',
  'Haval',
  'Hino',
  'Honda',
  'Hongqi',
  'Hyundai',
  'Infiniti',
  'Isuzu',
  'JAC Motors',
  'Jaguar',
  'Jeep',
  'Kia',
  'Koenigsegg',
  'Lada',
  'Lamborghini',
  'Lancia',
  'Land Rover',
  'Leapmotor',
  'Lexus',
  'Li Auto',
  'Lincoln',
  'Lotus',
  'Lucid',
  'Mahindra',
  'Maruti Suzuki',
  'Maserati',
  'Maybach',
  'Mazda',
  'McLaren',
  'Mercedes-Benz',
  'MG',
  'Mini',
  'Mitsubishi',
  'Morgan',
  'Neta',
  'NIO',
  'Nissan',
  'Opel',
  'ORA',
  'Pagani',
  'Perodua',
  'Peugeot',
  'Polestar',
  'Pontiac',
  'Porsche',
  'Proton',
  'Ram',
  'Renault',
  'Rivian',
  'Rolls-Royce',
  'Roewe',
  'Saab',
  'SAIC',
  'SEAT',
  'Seres',
  'Skoda',
  'Smart',
  'SsangYong',
  'Subaru',
  'Suzuki',
  'Tank',
  'Tata',
  'Tesla',
  'Toyota',
  'Volkswagen',
  'Volvo',
  'Voyah',
  'Wuling',
  'XPeng',
  'Zeekr',
];

export const VEHICLE_MODELS_BY_MAKE: Record<string, string[]> = {
  Abarth: ['500', '595', '695', '124 Spider', 'Punto Evo'],
  Acura: ['Integra', 'MDX', 'NSX', 'RDX', 'TLX'],
  'Alfa Romeo': ['4C', '156', 'Giulia', 'Giulietta', 'Stelvio', 'Tonale'],
  Alpine: ['A110', 'A290'],
  'Aston Martin': ['DB11', 'DB12', 'DBS', 'DBX', 'Valkyrie', 'Vantage'],
  Audi: ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q5', 'Q7', 'Q8', 'R8', 'RS6', 'TT'],
  Avatr: ['11', '12', '07'],
  BAIC: ['BJ40', 'EU5', 'X55'],
  Baojun: ['360', '510', '530', 'KiWi EV', 'Yep'],
  Bentley: ['Bentayga', 'Continental GT', 'Flying Spur'],
  Bestune: ['B70', 'T55', 'T77'],
  BMW: ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '7 Series', '8 Series', 'i4', 'i5', 'i7', 'iX', 'X1', 'X3', 'X5', 'X7'],
  Bugatti: ['Bolide', 'Chiron', 'Divo', 'Mistral', 'Veyron'],
  Buick: ['Enclave', 'Encore', 'Envision', 'GL8', 'LaCrosse'],
  BYD: ['Atto 3', 'Dolphin', 'Han', 'Qin', 'Seal', 'Seagull', 'Shark', 'Song', 'Tang', 'Yuan'],
  Cadillac: ['CT4', 'CT5', 'Escalade', 'Lyriq', 'XT4', 'XT5', 'XT6'],
  Changan: ['CS35 Plus', 'CS55 Plus', 'CS75 Plus', 'Eado', 'UNI-K', 'UNI-T', 'UNI-V'],
  Chery: ['Arrizo 5', 'Arrizo 8', 'Omoda 5', 'QQ', 'Tiggo 4', 'Tiggo 7', 'Tiggo 8'],
  Chevrolet: ['Blazer', 'Camaro', 'Colorado', 'Corvette', 'Equinox', 'Malibu', 'Silverado', 'Suburban', 'Tahoe', 'Trailblazer', 'Trax'],
  Chrysler: ['300', 'Pacifica', 'Voyager'],
  Citroen: ['Ami', 'Berlingo', 'C1', 'C3', 'C4', 'C5 Aircross', 'SpaceTourer'],
  Cupra: ['Ateca', 'Born', 'Formentor', 'Leon', 'Tavascan', 'Terramar'],
  Dacia: ['Duster', 'Jogger', 'Logan', 'Sandero', 'Spring'],
  Daihatsu: ['Ayla', 'Hijet', 'Rocky', 'Sirion', 'Taft', 'Terios', 'Xenia'],
  Deepal: ['G318', 'L07', 'S05', 'S07'],
  Denza: ['D9', 'N7', 'Z9 GT'],
  Dodge: ['Challenger', 'Charger', 'Durango', 'Hornet', 'Journey'],
  Dongfeng: ['Aeolus Yixuan', 'Forthing T5', 'Nammi 01'],
  DS: ['DS 3', 'DS 4', 'DS 7', 'DS 9'],
  FAW: ['Bestune B70', 'Bestune T77', 'Hongqi E-HS9'],
  Ferrari: ['296 GTB', '812 Superfast', 'F8 Tributo', 'Purosangue', 'Roma', 'SF90 Stradale'],
  Fiat: ['500', '500e', '500X', 'Doblo', 'Panda', 'Punto', 'Tipo'],
  Ford: ['Bronco', 'Edge', 'Escape', 'Everest', 'Explorer', 'F-150', 'Focus', 'Kuga', 'Mondeo', 'Mustang', 'Puma', 'Ranger', 'Transit'],
  GAC: ['Aion S', 'Aion Y', 'Emkoo', 'GS3', 'GS8'],
  Geely: ['Azkarra', 'Boyue', 'Coolray', 'Emgrand', 'Galaxy E8', 'Galaxy L7', 'Okavango'],
  Genesis: ['G70', 'G80', 'G90', 'GV60', 'GV70', 'GV80'],
  GMC: ['Acadia', 'Canyon', 'Hummer EV', 'Sierra', 'Terrain', 'Yukon'],
  'Great Wall': ['Cannon', 'Ora Good Cat', 'Poer', 'Tank 300', 'Tank 500'],
  Haval: ['H6', 'H9', 'Jolion', 'M6'],
  Hino: ['300', '500', '700'],
  Honda: ['Accord', 'BR-V', 'City', 'Civic', 'CR-V', 'Fit', 'Freed', 'HR-V', 'Jazz', 'Odyssey', 'Pilot', 'Ridgeline', 'Vezel', 'ZR-V'],
  Hongqi: ['E-HS9', 'H5', 'H9', 'HS5'],
  Hyundai: ['Accent', 'Creta', 'Elantra', 'Ioniq 5', 'Ioniq 6', 'Kona', 'Palisade', 'Santa Fe', 'Sonata', 'Staria', 'Tucson', 'Venue'],
  Infiniti: ['Q50', 'Q60', 'QX30', 'QX50', 'QX55', 'QX60', 'QX80'],
  Isuzu: ['Crosswind', 'D-Max', 'MU-X', 'Panther', 'Trooper'],
  'JAC Motors': ['J7', 'JS4', 'T8', 'Yiwei 3'],
  Jaguar: ['E-Pace', 'F-Pace', 'F-Type', 'I-Pace', 'XE', 'XF', 'XJ'],
  Jeep: ['Avenger', 'Cherokee', 'Compass', 'Gladiator', 'Grand Cherokee', 'Renegade', 'Wrangler'],
  Kia: ['Carnival', 'EV6', 'EV9', 'K5', 'Niro', 'Picanto', 'Rio', 'Seltos', 'Sonet', 'Sorento', 'Sportage', 'Stinger', 'Telluride'],
  Koenigsegg: ['Gemera', 'Jesko', 'Regera'],
  Lada: ['Granta', 'Largus', 'Niva', 'Vesta'],
  Lamborghini: ['Aventador', 'Countach', 'Gallardo', 'Huracan', 'Revuelto', 'Urus'],
  Lancia: ['Delta', 'Ypsilon'],
  'Land Rover': ['Defender', 'Discovery', 'Discovery Sport', 'Range Rover', 'Range Rover Evoque', 'Range Rover Sport', 'Range Rover Velar'],
  Leapmotor: ['B10', 'C01', 'C10', 'C11', 'T03'],
  Lexus: ['CT', 'ES', 'GX', 'IS', 'LC', 'LS', 'LX', 'NX', 'RC', 'RX', 'RZ', 'UX'],
  'Li Auto': ['L6', 'L7', 'L8', 'L9', 'Mega'],
  Lincoln: ['Aviator', 'Corsair', 'Nautilus', 'Navigator'],
  Lotus: ['Elise', 'Emira', 'Eletre', 'Evija', 'Evora', 'Exige'],
  Lucid: ['Air', 'Gravity'],
  Mahindra: ['Bolero', 'Scorpio', 'Thar', 'XUV300', 'XUV700'],
  'Maruti Suzuki': ['Alto', 'Baleno', 'Brezza', 'Dzire', 'Ertiga', 'Grand Vitara', 'Swift', 'WagonR'],
  Maserati: ['Ghibli', 'GranTurismo', 'Grecale', 'Levante', 'MC20', 'Quattroporte'],
  Maybach: ['S-Class', 'GLS'],
  Mazda: ['BT-50', 'CX-30', 'CX-5', 'CX-50', 'CX-60', 'CX-80', 'CX-90', 'Mazda2', 'Mazda3', 'Mazda6', 'MX-5'],
  McLaren: ['570S', '720S', '750S', '765LT', 'Artura', 'GT', 'P1'],
  'Mercedes-Benz': ['A-Class', 'AMG GT', 'B-Class', 'C-Class', 'CLA', 'E-Class', 'EQA', 'EQB', 'EQC', 'EQS', 'G-Class', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'S-Class'],
  MG: ['4 EV', '5 EV', 'Cyberster', 'HS', 'MG3', 'MG5', 'ZS'],
  Mini: ['Aceman', 'Clubman', 'Convertible', 'Cooper', 'Countryman'],
  Mitsubishi: ['ASX', 'Attrage', 'Delica', 'Eclipse Cross', 'Lancer', 'Mirage', 'Outlander', 'Pajero', 'Triton', 'Xpander'],
  Morgan: ['3 Wheeler', 'Plus Four', 'Plus Six', 'Super 3'],
  Neta: ['Aya', 'L', 'S', 'U'],
  NIO: ['EC6', 'EC7', 'EL6', 'ES6', 'ES8', 'ET5', 'ET7'],
  Nissan: ['Altima', 'Ariya', 'GT-R', 'Leaf', 'Maxima', 'Murano', 'Navara', 'Note', 'Pathfinder', 'Qashqai', 'Rogue', 'Sentra', 'Serena', 'Teana', 'Titan', 'X-Trail'],
  Opel: ['Astra', 'Combo', 'Corsa', 'Crossland', 'Grandland', 'Mokka'],
  ORA: ['07', 'Ballet Cat', 'Funky Cat', 'Lightning Cat'],
  Pagani: ['Huayra', 'Utopia', 'Zonda'],
  Perodua: ['Alza', 'Ativa', 'Axia', 'Bezza', 'Myvi'],
  Peugeot: ['2008', '208', '3008', '308', '408', '5008'],
  Polestar: ['2', '3', '4'],
  Pontiac: ['Firebird', 'G6', 'GTO'],
  Porsche: ['718 Boxster', '718 Cayman', '911', 'Cayenne', 'Macan', 'Panamera', 'Taycan'],
  Proton: ['Exora', 'Persona', 'S70', 'Saga', 'X50', 'X70'],
  Ram: ['1500', '2500', '3500', 'ProMaster'],
  Renault: ['Arkana', 'Austral', 'Captur', 'Clio', 'Duster', 'Kadjar', 'Koleos', 'Megane', 'Sandero', 'Scenic'],
  Rivian: ['R1S', 'R1T', 'R2'],
  'Rolls-Royce': ['Cullinan', 'Dawn', 'Ghost', 'Phantom', 'Spectre', 'Wraith'],
  Roewe: ['D7', 'eRX5', 'i5', 'RX5'],
  Saab: ['9-3', '9-5', '900'],
  SAIC: ['IM LS6', 'Maxus T90', 'Roewe RX5'],
  SEAT: ['Arona', 'Ateca', 'Ibiza', 'Leon', 'Tarraco'],
  Seres: ['3', '5', '7'],
  Skoda: ['Enyaq', 'Fabia', 'Kamiq', 'Karoq', 'Kodiaq', 'Octavia', 'Superb'],
  Smart: ['#1', '#3', 'Forfour', 'Fortwo'],
  SsangYong: ['Korando', 'Musso', 'Rexton', 'Tivoli'],
  Subaru: ['Ascent', 'BRZ', 'Crosstrek', 'Forester', 'Impreza', 'Legacy', 'Levorg', 'Outback', 'WRX', 'XV'],
  Suzuki: ['Alto', 'Baleno', 'Celerio', 'Ciaz', 'Ertiga', 'Ignis', 'Jimny', 'S-Presso', 'Swift', 'Vitara', 'XL7'],
  Tank: ['300', '500', '700'],
  Tata: ['Altroz', 'Harrier', 'Nexon', 'Punch', 'Safari', 'Tiago', 'Tigor'],
  Tesla: ['Cybertruck', 'Model 3', 'Model S', 'Model X', 'Model Y', 'Roadster'],
  Toyota: ['4Runner', 'Alphard', 'C-HR', 'Camry', 'Corolla', 'Fortuner', 'GR86', 'Harrier', 'Highlander', 'Hilux', 'Innova', 'Land Cruiser', 'Prius', 'RAV4', 'Sienna', 'Supra', 'Tacoma', 'Vellfire', 'Vios', 'Yaris'],
  Volkswagen: ['Arteon', 'Golf', 'ID.3', 'ID.4', 'Jetta', 'Passat', 'Polo', 'T-Cross', 'T-Roc', 'Taos', 'Tiguan', 'Touareg'],
  Volvo: ['C40', 'EX30', 'EX90', 'S60', 'S90', 'V60', 'V90', 'XC40', 'XC60', 'XC90'],
  Voyah: ['Dream', 'Free', 'Passion'],
  Wuling: ['Asta', 'Binguo', 'Hong Guang Mini EV', 'Starlight'],
  XPeng: ['G3', 'G6', 'G9', 'P5', 'P7', 'X9'],
  Zeekr: ['001', '007', '009', 'X'],
};

export const VEHICLE_COLORS: string[] = [
  'Beige 米色',
  'Black 黑色',
  'Blue 藍色',
  'Bronze 古銅色',
  'Brown 棕色',
  'Burgundy 酒紅',
  'Champagne 香檳色',
  'Cream 奶油色',
  'Dark Blue 深藍',
  'Gold 金色',
  'Graphite 石墨灰',
  'Gray 灰色',
  'Green 綠色',
  'Gun Metal 鎗鐵灰',
  'Ivory 象牙白',
  'Khaki 卡其色',
  'Maroon 栗色',
  'Matte Black 啞光黑',
  'Matte Blue 啞光藍',
  'Matte Gray 啞光灰',
  'Matte Green 啞光綠',
  'Midnight Black 午夜黑',
  'Mint Green 薄荷綠',
  'Navy Blue 海軍藍',
  'Olive Green 橄欖綠',
  'Orange 橙色',
  'Pearl Blue 珍珠藍',
  'Pearl White 珍珠白',
  'Purple 紫色',
  'Red 紅色',
  'Rose Gold 玫瑰金',
  'Silver 銀色',
  'Sky Blue 天空藍',
  'Space Gray 太空灰',
  'Sunset Orange 日落橙',
  'Teal 青色',
  'Titanium Gray 鈦灰',
  'White 白色',
  'Yellow 黃色',
];

const EXTENDED_MODELS_BY_MAKE: Record<string, string[]> = {
  'BYD 比亚迪': [
    'Han 汉 | Sedan 轿车',
    'Qin Plus 秦PLUS | Sedan 轿车',
    'Seal 海豹 | Sedan 轿车',
    'Dolphin 海豚 | Hatchback 掀背车',
    'Seagull 海鸥 | Hatchback 掀背车',
    'Yuan Plus 元PLUS (Atto 3) | SUV 运动型多用途车',
    'Song Plus 宋PLUS | SUV 运动型多用途车',
    'Tang 唐 | SUV 运动型多用途车',
    'Denza D9 腾势D9 | MPV 多功能车',
  ],
  'Geely 吉利': [
    'Emgrand 帝豪 | Sedan 轿车',
    'Preface 星瑞 | Sedan 轿车',
    'Coolray 缤越 | SUV 运动型多用途车',
    'Boyue 博越 | SUV 运动型多用途车',
    'Monjaro 星越L | SUV 运动型多用途车',
    'Galaxy E8 银河E8 | Sedan 轿车',
    'Galaxy L7 银河L7 | SUV 运动型多用途车',
  ],
  'Chery 奇瑞': [
    'Arrizo 5 艾瑞泽5 | Sedan 轿车',
    'Arrizo 8 艾瑞泽8 | Sedan 轿车',
    'Tiggo 4 瑞虎4 | SUV 运动型多用途车',
    'Tiggo 7 瑞虎7 | SUV 运动型多用途车',
    'Tiggo 8 瑞虎8 | SUV 运动型多用途车',
    'Omoda 5 欧萌达5 | SUV 运动型多用途车',
  ],
  'Great Wall 长城': [
    'Cannon 炮 | Pickup 皮卡',
    'Poer 山海炮 | Pickup 皮卡',
  ],
  'Haval 哈弗': [
    'H6 哈弗H6 | SUV 运动型多用途车',
    'Jolion 初恋/赤兔 | SUV 运动型多用途车',
    'Big Dog 大狗 | SUV 运动型多用途车',
  ],
  'Tank 坦克': [
    'Tank 300 坦克300 | Off-road 越野车',
    'Tank 500 坦克500 | Off-road 越野车',
    'Tank 700 坦克700 | Off-road 越野车',
  ],
  'ORA 欧拉': [
    'Good Cat 好猫 | Hatchback 掀背车',
    'Lightning Cat 闪电猫 | Sedan 轿车',
    'Ballet Cat 芭蕾猫 | Hatchback 掀背车',
  ],
  'SAIC 上汽': [
    'Roewe D7 荣威D7 | Sedan 轿车',
    'Roewe RX5 荣威RX5 | SUV 运动型多用途车',
    'MG 4 EV 名爵4 | Hatchback 掀背车',
    'MG HS 名爵HS | SUV 运动型多用途车',
    'Wuling Hongguang Mini EV 五菱宏光MINIEV | Hatchback 掀背车',
    'Baojun Yep 宝骏悦也 | SUV 运动型多用途车',
  ],
  'GAC 广汽': [
    'Aion S 埃安S | Sedan 轿车',
    'Aion Y 埃安Y | SUV 运动型多用途车',
    'Aion V 埃安V | SUV 运动型多用途车',
    'Trumpchi GS3 传祺GS3 | SUV 运动型多用途车',
    'Trumpchi GS8 传祺GS8 | SUV 运动型多用途车',
    'M8 传祺M8 | MPV 多功能车',
  ],
  'Changan 长安': [
    'Eado 逸动 | Sedan 轿车',
    'UNI-V 长安UNI-V | Sedan 轿车',
    'UNI-K 长安UNI-K | SUV 运动型多用途车',
    'CS55 Plus 长安CS55 PLUS | SUV 运动型多用途车',
    'CS75 Plus 长安CS75 PLUS | SUV 运动型多用途车',
  ],
  'Deepal 深蓝': [
    'SL03 深蓝SL03 | Sedan 轿车',
    'S07 深蓝S07 | SUV 运动型多用途车',
    'G318 深蓝G318 | Off-road 越野车',
  ],
  'Avatr 阿维塔': [
    '11 阿维塔11 | SUV 运动型多用途车',
    '12 阿维塔12 | Sedan 轿车',
    '07 阿维塔07 | SUV 运动型多用途车',
  ],
  'NIO 蔚来': [
    'ET5 蔚来ET5 | Sedan 轿车',
    'ET7 蔚来ET7 | Sedan 轿车',
    'ES6 蔚来ES6 | SUV 运动型多用途车',
    'ES8 蔚来ES8 | SUV 运动型多用途车',
    'EC6 蔚来EC6 | SUV 运动型多用途车',
  ],
  'XPeng 小鹏': [
    'Mona M03 小鹏MONA M03 | Hatchback 掀背车',
    'P7 小鹏P7 | Sedan 轿车',
    'P7+ 小鹏P7+ | Sedan 轿车',
    'G6 小鹏G6 | SUV 运动型多用途车',
    'G9 小鹏G9 | SUV 运动型多用途车',
    'X9 小鹏X9 | MPV 多功能车',
  ],
  'Li Auto 理想': [
    'L6 理想L6 | SUV 运动型多用途车',
    'L7 理想L7 | SUV 运动型多用途车',
    'L8 理想L8 | SUV 运动型多用途车',
    'L9 理想L9 | SUV 运动型多用途车',
    'MEGA 理想MEGA | MPV 多功能车',
  ],
  'Zeekr 极氪': [
    '001 极氪001 | Wagon 旅行车',
    '007 极氪007 | Sedan 轿车',
    '009 极氪009 | MPV 多功能车',
    'X 极氪X | SUV 运动型多用途车',
    '7X 极氪7X | SUV 运动型多用途车',
  ],
  'Leapmotor 零跑': [
    'T03 零跑T03 | Hatchback 掀背车',
    'C01 零跑C01 | Sedan 轿车',
    'C10 零跑C10 | SUV 运动型多用途车',
    'C11 零跑C11 | SUV 运动型多用途车',
  ],
  'Hongqi 红旗': [
    'H5 红旗H5 | Sedan 轿车',
    'H9 红旗H9 | Sedan 轿车',
    'HS5 红旗HS5 | SUV 运动型多用途车',
    'E-HS9 红旗E-HS9 | SUV 运动型多用途车',
  ],
  'Xiaomi 小米': [
    'SU7 小米SU7 | Sedan 轿车',
    'SU7 Ultra 小米SU7 Ultra | Sedan 轿车',
  ],
  'Voyah 岚图': [
    'Free 岚图FREE | SUV 运动型多用途车',
    'Dream 岚图梦想家 | MPV 多功能车',
    'Passion 岚图追光 | Sedan 轿车',
  ],
  'AITO 问界': [
    'M5 问界M5 | SUV 运动型多用途车',
    'M7 问界M7 | SUV 运动型多用途车',
    'M9 问界M9 | SUV 运动型多用途车',
  ],
  'Tesla 特斯拉': [
    'Model 3 特斯拉Model 3 | Sedan 轿车',
    'Model Y 特斯拉Model Y | SUV 运动型多用途车',
    'Model S 特斯拉Model S | Sedan 轿车',
    'Model X 特斯拉Model X | SUV 运动型多用途车',
  ],
  'Toyota 丰田': [
    'Corolla 卡罗拉 | Sedan 轿车',
    'Camry 凯美瑞 | Sedan 轿车',
    'Yaris 雅力士 | Hatchback 掀背车',
    'RAV4 荣放 | SUV 运动型多用途车',
    'Alphard 埃尔法 | MPV 多功能车',
  ],
  'Honda 本田': [
    'Civic 思域 | Sedan 轿车',
    'Accord 雅阁 | Sedan 轿车',
    'Fit 飞度 | Hatchback 掀背车',
    'CR-V 本田CR-V | SUV 运动型多用途车',
    'HR-V 本田HR-V | SUV 运动型多用途车',
  ],
  'Nissan 日产': [
    'Sylphy 轩逸 | Sedan 轿车',
    'Teana 天籁 | Sedan 轿车',
    'Ariya 艾睿雅 | SUV 运动型多用途车',
    'X-Trail 奇骏 | SUV 运动型多用途车',
    'Serena Serena | MPV 多功能车',
  ],
  'Mercedes-Benz 奔驰': [
    'C-Class 奔驰C级 | Sedan 轿车',
    'E-Class 奔驰E级 | Sedan 轿车',
    'GLC 奔驰GLC | SUV 运动型多用途车',
    'GLE 奔驰GLE | SUV 运动型多用途车',
    'V-Class 奔驰V级 | MPV 多功能车',
  ],
  'BMW 宝马': [
    '3 Series 宝马3系 | Sedan 轿车',
    '5 Series 宝马5系 | Sedan 轿车',
    'X3 宝马X3 | SUV 运动型多用途车',
    'X5 宝马X5 | SUV 运动型多用途车',
    'iX 宝马iX | SUV 运动型多用途车',
  ],
  'Audi 奥迪': [
    'A3 奥迪A3 | Sedan 轿车',
    'A4L 奥迪A4L | Sedan 轿车',
    'A6L 奥迪A6L | Sedan 轿车',
    'Q5 奥迪Q5 | SUV 运动型多用途车',
    'Q7 奥迪Q7 | SUV 运动型多用途车',
  ],
  'Volkswagen 大众': [
    'Lavida 朗逸 | Sedan 轿车',
    'Passat 帕萨特 | Sedan 轿车',
    'Golf 高尔夫 | Hatchback 掀背车',
    'Tiguan 途观 | SUV 运动型多用途车',
    'ID.4 大众ID.4 | SUV 运动型多用途车',
  ],
  'Hyundai 现代': [
    'Elantra 伊兰特 | Sedan 轿车',
    'Sonata 索纳塔 | Sedan 轿车',
    'Tucson 途胜 | SUV 运动型多用途车',
    'Santa Fe 胜达 | SUV 运动型多用途车',
  ],
  'Kia 起亚': [
    'K3 起亚K3 | Sedan 轿车',
    'K5 起亚K5 | Sedan 轿车',
    'Sportage 狮铂拓界 | SUV 运动型多用途车',
    'Sorento 索兰托 | SUV 运动型多用途车',
    'Carnival 嘉华 | MPV 多功能车',
  ],
  'Volvo 沃尔沃': [
    'S60 沃尔沃S60 | Sedan 轿车',
    'S90 沃尔沃S90 | Sedan 轿车',
    'XC40 沃尔沃XC40 | SUV 运动型多用途车',
    'XC60 沃尔沃XC60 | SUV 运动型多用途车',
    'XC90 沃尔沃XC90 | SUV 运动型多用途车',
  ],
};

const normalizeMakeName = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim();
};

const makeLookupCandidates = (value: string): string[] => {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const base = normalizeMakeName(trimmed);
  const firstToken = normalizeMakeName(trimmed.split(' ')[0] || '');
  return Array.from(new Set([base, firstToken].filter(Boolean)));
};

export const VEHICLE_MAKES_EXTENDED: string[] = Array.from(
  new Set([...VEHICLE_MAKES, ...Object.keys(EXTENDED_MODELS_BY_MAKE)])
).sort((a, b) => a.localeCompare(b));

export const getVehicleModelsForMake = (make: string): string[] => {
  const candidates = makeLookupCandidates(make);
  if (candidates.length === 0) return [];

  const staticKey = Object.keys(VEHICLE_MODELS_BY_MAKE).find(key => {
    const keyNormalized = normalizeMakeName(key);
    return candidates.includes(keyNormalized);
  });

  const extendedKey = Object.keys(EXTENDED_MODELS_BY_MAKE).find(key => {
    const keyNormalized = normalizeMakeName(key);
    return candidates.includes(keyNormalized);
  });

  const makePrefixes = Array.from(new Set([
    make,
    staticKey || '',
    extendedKey || '',
  ].flatMap((entry) => {
    const trimmed = (entry || '').trim();
    if (!trimmed) return [];
    const englishPart = trimmed.replace(/[\u4e00-\u9fff].*$/, '').trim();
    const chineseChunks = trimmed.match(/[\u4e00-\u9fff]+/g) || [];
    return [trimmed, englishPart, ...chineseChunks].filter(Boolean);
  })));

  const normalizeModelLabel = (value: string): string => {
    // Extended labels may include " | <vehicle type>", which should not appear in model choices.
    let model = value.split('|')[0].trim();

    // Remove leading make prefixes like "Tank 300" -> "300" or "坦克300" -> "300".
    for (const prefix of makePrefixes.sort((a, b) => b.length - a.length)) {
      const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      model = model.replace(new RegExp(`^${escapedPrefix}[\\s-]*`, 'i'), '').trim();
    }

    return model;
  };

  const normalizeModelKey = (value: string): string => {
    return normalizeMakeName(value).replace(/\s+/g, '');
  };

  const staticModels = staticKey ? VEHICLE_MODELS_BY_MAKE[staticKey] : [];
  const extendedModels = extendedKey ? EXTENDED_MODELS_BY_MAKE[extendedKey] : [];

  const merged = [...extendedModels, ...staticModels]
    .map(normalizeModelLabel)
    .filter(Boolean);

  const byKey = new Map<string, string>();
  for (const model of merged) {
    const key = normalizeModelKey(model);
    const existing = byKey.get(key);
    if (!existing || model.length < existing.length) {
      byKey.set(key, model);
    }
  }

  return Array.from(byKey.values());
};