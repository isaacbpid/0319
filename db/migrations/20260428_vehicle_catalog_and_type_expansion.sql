-- Expand supported vehicle types and add a DB catalog for autofill.

alter table vehicles drop constraint if exists chk_vehicles_vehicle_type;
alter table vehicles add constraint chk_vehicles_vehicle_type
check (
  vehicle_type is null
  or lower(vehicle_type) in (
    'sedan',
    'hatchback',
    'wagon',
    'coupe',
    'sports',
    'crossover',
    'suv',
    'offroad',
    'pickup',
    'mpv',
    'van',
    'limousine'
  )
);

update vehicles
set vehicle_size = case
  when lower(coalesce(vehicle_type, '')) in ('sedan', 'hatchback', 'wagon', 'coupe', 'sports') then 'regular'
  when lower(coalesce(vehicle_type, '')) in ('crossover', 'suv', 'offroad', 'pickup', 'mpv', 'van', 'limousine') then 'large'
  else vehicle_size
end
where true;

alter table vehicles drop constraint if exists chk_vehicles_type_size_consistency;
alter table vehicles add constraint chk_vehicles_type_size_consistency
check (
  vehicle_type is null
  or vehicle_size is null
  or (
    (lower(vehicle_type) in ('sedan', 'hatchback', 'wagon', 'coupe', 'sports') and lower(vehicle_size) = 'regular')
    or
    (lower(vehicle_type) in ('crossover', 'suv', 'offroad', 'pickup', 'mpv', 'van', 'limousine') and lower(vehicle_size) = 'large')
  )
);

create table if not exists vehicle_model_catalog (
  id text primary key,
  make_en text not null,
  make_zh text,
  model_en text not null,
  model_zh text,
  vehicle_type_en text not null,
  vehicle_type_zh text,
  market_scope text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (make_en, model_en)
);

create index if not exists idx_vehicle_model_catalog_make_en on vehicle_model_catalog (make_en);
create index if not exists idx_vehicle_model_catalog_model_en on vehicle_model_catalog (model_en);

insert into vehicle_model_catalog (
  id, make_en, make_zh, model_en, model_zh, vehicle_type_en, vehicle_type_zh, market_scope
)
values
  ('vmc_byd_han', 'BYD', '比亚迪', 'Han', '汉', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_byd_qin_plus', 'BYD', '比亚迪', 'Qin Plus', '秦PLUS', 'sedan', '轿车', 'China Mainland'),
  ('vmc_byd_seal', 'BYD', '比亚迪', 'Seal', '海豹', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_byd_dolphin', 'BYD', '比亚迪', 'Dolphin', '海豚', 'hatchback', '掀背车', 'China Mainland, Hong Kong'),
  ('vmc_byd_seagull', 'BYD', '比亚迪', 'Seagull', '海鸥', 'hatchback', '掀背车', 'China Mainland'),
  ('vmc_byd_yuan_plus', 'BYD', '比亚迪', 'Yuan Plus (Atto 3)', '元PLUS（元PLUS）', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_byd_song_plus', 'BYD', '比亚迪', 'Song Plus', '宋PLUS', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_byd_tang', 'BYD', '比亚迪', 'Tang', '唐', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_denza_d9', 'Denza', '腾势', 'D9', 'D9', 'mpv', '多功能车', 'China Mainland, Hong Kong'),
  ('vmc_geely_emgrand', 'Geely', '吉利', 'Emgrand', '帝豪', 'sedan', '轿车', 'China Mainland'),
  ('vmc_geely_preface', 'Geely', '吉利', 'Preface', '星瑞', 'sedan', '轿车', 'China Mainland'),
  ('vmc_geely_coolray', 'Geely', '吉利', 'Coolray', '缤越', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_geely_boyue', 'Geely', '吉利', 'Boyue', '博越', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_geely_monjaro', 'Geely', '吉利', 'Monjaro', '星越L', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_geely_galaxy_e8', 'Geely', '吉利', 'Galaxy E8', '银河E8', 'sedan', '轿车', 'China Mainland'),
  ('vmc_geely_galaxy_l7', 'Geely', '吉利', 'Galaxy L7', '银河L7', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_chery_arrizo5', 'Chery', '奇瑞', 'Arrizo 5', '艾瑞泽5', 'sedan', '轿车', 'China Mainland'),
  ('vmc_chery_arrizo8', 'Chery', '奇瑞', 'Arrizo 8', '艾瑞泽8', 'sedan', '轿车', 'China Mainland'),
  ('vmc_chery_tiggo4', 'Chery', '奇瑞', 'Tiggo 4', '瑞虎4', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_chery_tiggo7', 'Chery', '奇瑞', 'Tiggo 7', '瑞虎7', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_chery_tiggo8', 'Chery', '奇瑞', 'Tiggo 8', '瑞虎8', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_chery_omoda5', 'Chery', '奇瑞', 'Omoda 5', '欧萌达5', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_haval_h6', 'Haval', '哈弗', 'H6', 'H6', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_haval_jolion', 'Haval', '哈弗', 'Jolion', '初恋/赤兔', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_tank_300', 'Tank', '坦克', '300', '300', 'offroad', '越野车', 'China Mainland, Hong Kong'),
  ('vmc_tank_500', 'Tank', '坦克', '500', '500', 'offroad', '越野车', 'China Mainland'),
  ('vmc_ora_goodcat', 'ORA', '欧拉', 'Good Cat', '好猫', 'hatchback', '掀背车', 'China Mainland, Hong Kong'),
  ('vmc_ora_lightningcat', 'ORA', '欧拉', 'Lightning Cat', '闪电猫', 'sedan', '轿车', 'China Mainland'),
  ('vmc_roewe_d7', 'Roewe', '荣威', 'D7', 'D7', 'sedan', '轿车', 'China Mainland'),
  ('vmc_roewe_rx5', 'Roewe', '荣威', 'RX5', 'RX5', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_mg4', 'MG', '名爵', 'MG4 EV', 'MG4 EV', 'hatchback', '掀背车', 'China Mainland, Hong Kong'),
  ('vmc_mg_hs', 'MG', '名爵', 'HS', 'HS', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_wuling_mini', 'Wuling', '五菱', 'Hongguang Mini EV', '宏光MINIEV', 'hatchback', '掀背车', 'China Mainland'),
  ('vmc_gac_aions', 'Aion', '埃安', 'Aion S', 'Aion S', 'sedan', '轿车', 'China Mainland'),
  ('vmc_gac_aiony', 'Aion', '埃安', 'Aion Y', 'Aion Y', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_gac_aionv', 'Aion', '埃安', 'Aion V', 'Aion V', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_trumpchi_gs3', 'Trumpchi', '传祺', 'GS3', 'GS3', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_trumpchi_gs8', 'Trumpchi', '传祺', 'GS8', 'GS8', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_trumpchi_m8', 'Trumpchi', '传祺', 'M8', 'M8', 'mpv', '多功能车', 'China Mainland, Hong Kong'),
  ('vmc_changan_eado', 'Changan', '长安', 'Eado', '逸动', 'sedan', '轿车', 'China Mainland'),
  ('vmc_changan_univ', 'Changan', '长安', 'UNI-V', 'UNI-V', 'sedan', '轿车', 'China Mainland'),
  ('vmc_changan_unik', 'Changan', '长安', 'UNI-K', 'UNI-K', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_changan_cs55p', 'Changan', '长安', 'CS55 Plus', 'CS55 PLUS', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_changan_cs75p', 'Changan', '长安', 'CS75 Plus', 'CS75 PLUS', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_deepal_sl03', 'Deepal', '深蓝', 'SL03', 'SL03', 'sedan', '轿车', 'China Mainland'),
  ('vmc_deepal_s07', 'Deepal', '深蓝', 'S07', 'S07', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_avatr11', 'Avatr', '阿维塔', '11', '11', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_avatr12', 'Avatr', '阿维塔', '12', '12', 'sedan', '轿车', 'China Mainland'),
  ('vmc_nio_et5', 'NIO', '蔚来', 'ET5', 'ET5', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_nio_et7', 'NIO', '蔚来', 'ET7', 'ET7', 'sedan', '轿车', 'China Mainland'),
  ('vmc_nio_es6', 'NIO', '蔚来', 'ES6', 'ES6', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_nio_es8', 'NIO', '蔚来', 'ES8', 'ES8', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_xpeng_m03', 'XPeng', '小鹏', 'Mona M03', 'MONA M03', 'hatchback', '掀背车', 'China Mainland'),
  ('vmc_xpeng_p7', 'XPeng', '小鹏', 'P7', 'P7', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_xpeng_g6', 'XPeng', '小鹏', 'G6', 'G6', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_xpeng_g9', 'XPeng', '小鹏', 'G9', 'G9', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_xpeng_x9', 'XPeng', '小鹏', 'X9', 'X9', 'mpv', '多功能车', 'China Mainland'),
  ('vmc_liauto_l6', 'Li Auto', '理想', 'L6', 'L6', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_liauto_l7', 'Li Auto', '理想', 'L7', 'L7', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_liauto_l8', 'Li Auto', '理想', 'L8', 'L8', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_liauto_l9', 'Li Auto', '理想', 'L9', 'L9', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_zeekr_001', 'Zeekr', '极氪', '001', '001', 'wagon', '旅行车', 'China Mainland, Hong Kong'),
  ('vmc_zeekr_007', 'Zeekr', '极氪', '007', '007', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_zeekr_009', 'Zeekr', '极氪', '009', '009', 'mpv', '多功能车', 'China Mainland, Hong Kong'),
  ('vmc_zeekr_x', 'Zeekr', '极氪', 'X', 'X', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_zeekr_7x', 'Zeekr', '极氪', '7X', '7X', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_leap_t03', 'Leapmotor', '零跑', 'T03', 'T03', 'hatchback', '掀背车', 'China Mainland'),
  ('vmc_leap_c01', 'Leapmotor', '零跑', 'C01', 'C01', 'sedan', '轿车', 'China Mainland'),
  ('vmc_leap_c10', 'Leapmotor', '零跑', 'C10', 'C10', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_hongqi_h5', 'Hongqi', '红旗', 'H5', 'H5', 'sedan', '轿车', 'China Mainland'),
  ('vmc_hongqi_h9', 'Hongqi', '红旗', 'H9', 'H9', 'sedan', '轿车', 'China Mainland'),
  ('vmc_hongqi_hs5', 'Hongqi', '红旗', 'HS5', 'HS5', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_xiaomi_su7', 'Xiaomi', '小米', 'SU7', 'SU7', 'sedan', '轿车', 'China Mainland'),
  ('vmc_xiaomi_su7u', 'Xiaomi', '小米', 'SU7 Ultra', 'SU7 Ultra', 'sedan', '轿车', 'China Mainland'),
  ('vmc_voyah_free', 'Voyah', '岚图', 'Free', 'FREE', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_voyah_dream', 'Voyah', '岚图', 'Dream', '梦想家', 'mpv', '多功能车', 'China Mainland'),
  ('vmc_voyah_passion', 'Voyah', '岚图', 'Passion', '追光', 'sedan', '轿车', 'China Mainland'),
  ('vmc_aito_m5', 'AITO', '问界', 'M5', 'M5', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_aito_m7', 'AITO', '问界', 'M7', 'M7', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_aito_m9', 'AITO', '问界', 'M9', 'M9', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_tesla_m3', 'Tesla', '特斯拉', 'Model 3', 'Model 3', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_tesla_my', 'Tesla', '特斯拉', 'Model Y', 'Model Y', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_toyota_corolla', 'Toyota', '丰田', 'Corolla', '卡罗拉', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_toyota_camry', 'Toyota', '丰田', 'Camry', '凯美瑞', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_toyota_yaris', 'Toyota', '丰田', 'Yaris', '雅力士', 'hatchback', '掀背车', 'Hong Kong'),
  ('vmc_toyota_rav4', 'Toyota', '丰田', 'RAV4', '荣放', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_toyota_alphard', 'Toyota', '丰田', 'Alphard', '埃尔法', 'mpv', '多功能车', 'China Mainland, Hong Kong'),
  ('vmc_honda_civic', 'Honda', '本田', 'Civic', '思域', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_honda_accord', 'Honda', '本田', 'Accord', '雅阁', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_honda_fit', 'Honda', '本田', 'Fit', '飞度', 'hatchback', '掀背车', 'China Mainland, Hong Kong'),
  ('vmc_honda_crv', 'Honda', '本田', 'CR-V', 'CR-V', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_honda_hrv', 'Honda', '本田', 'HR-V', 'HR-V', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_nissan_sylphy', 'Nissan', '日产', 'Sylphy', '轩逸', 'sedan', '轿车', 'China Mainland'),
  ('vmc_nissan_teana', 'Nissan', '日产', 'Teana', '天籁', 'sedan', '轿车', 'China Mainland'),
  ('vmc_nissan_xtrail', 'Nissan', '日产', 'X-Trail', '奇骏', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_nissan_serena', 'Nissan', '日产', 'Serena', 'Serena', 'mpv', '多功能车', 'Hong Kong'),
  ('vmc_mb_cclass', 'Mercedes-Benz', '奔驰', 'C-Class', 'C级', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_mb_eclass', 'Mercedes-Benz', '奔驰', 'E-Class', 'E级', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_mb_glc', 'Mercedes-Benz', '奔驰', 'GLC', 'GLC', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_mb_gle', 'Mercedes-Benz', '奔驰', 'GLE', 'GLE', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_mb_vclass', 'Mercedes-Benz', '奔驰', 'V-Class', 'V级', 'mpv', '多功能车', 'China Mainland, Hong Kong'),
  ('vmc_bmw_3', 'BMW', '宝马', '3 Series', '3系', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_bmw_5', 'BMW', '宝马', '5 Series', '5系', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_bmw_x3', 'BMW', '宝马', 'X3', 'X3', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_bmw_x5', 'BMW', '宝马', 'X5', 'X5', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_audi_a3', 'Audi', '奥迪', 'A3', 'A3', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_audi_a4l', 'Audi', '奥迪', 'A4L', 'A4L', 'sedan', '轿车', 'China Mainland'),
  ('vmc_audi_a6l', 'Audi', '奥迪', 'A6L', 'A6L', 'sedan', '轿车', 'China Mainland'),
  ('vmc_audi_q5', 'Audi', '奥迪', 'Q5', 'Q5', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_audi_q7', 'Audi', '奥迪', 'Q7', 'Q7', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_vw_lavida', 'Volkswagen', '大众', 'Lavida', '朗逸', 'sedan', '轿车', 'China Mainland'),
  ('vmc_vw_passat', 'Volkswagen', '大众', 'Passat', '帕萨特', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_vw_golf', 'Volkswagen', '大众', 'Golf', '高尔夫', 'hatchback', '掀背车', 'China Mainland, Hong Kong'),
  ('vmc_vw_tiguan', 'Volkswagen', '大众', 'Tiguan', '途观', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_vw_id4', 'Volkswagen', '大众', 'ID.4', 'ID.4', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_hyundai_elantra', 'Hyundai', '现代', 'Elantra', '伊兰特', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_hyundai_sonata', 'Hyundai', '现代', 'Sonata', '索纳塔', 'sedan', '轿车', 'China Mainland'),
  ('vmc_hyundai_tucson', 'Hyundai', '现代', 'Tucson', '途胜', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_hyundai_santafe', 'Hyundai', '现代', 'Santa Fe', '胜达', 'suv', '运动型多用途车', 'China Mainland'),
  ('vmc_kia_k3', 'Kia', '起亚', 'K3', 'K3', 'sedan', '轿车', 'China Mainland'),
  ('vmc_kia_k5', 'Kia', '起亚', 'K5', 'K5', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_kia_sportage', 'Kia', '起亚', 'Sportage', '狮铂拓界', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_kia_sorento', 'Kia', '起亚', 'Sorento', '索兰托', 'suv', '运动型多用途车', 'Hong Kong'),
  ('vmc_kia_carnival', 'Kia', '起亚', 'Carnival', '嘉华', 'mpv', '多功能车', 'China Mainland, Hong Kong'),
  ('vmc_volvo_s60', 'Volvo', '沃尔沃', 'S60', 'S60', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_volvo_s90', 'Volvo', '沃尔沃', 'S90', 'S90', 'sedan', '轿车', 'China Mainland, Hong Kong'),
  ('vmc_volvo_xc40', 'Volvo', '沃尔沃', 'XC40', 'XC40', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_volvo_xc60', 'Volvo', '沃尔沃', 'XC60', 'XC60', 'suv', '运动型多用途车', 'China Mainland, Hong Kong'),
  ('vmc_volvo_xc90', 'Volvo', '沃尔沃', 'XC90', 'XC90', 'suv', '运动型多用途车', 'China Mainland, Hong Kong')
on conflict (make_en, model_en) do update
set
  make_zh = excluded.make_zh,
  model_zh = excluded.model_zh,
  vehicle_type_en = excluded.vehicle_type_en,
  vehicle_type_zh = excluded.vehicle_type_zh,
  market_scope = excluded.market_scope,
  is_active = true,
  updated_at = now();
