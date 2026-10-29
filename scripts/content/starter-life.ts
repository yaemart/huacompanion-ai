// Source discovery on 2026-10-29. Candidate drafts only; no human verification claimed.
const fair='https://www.fairmont.com/en/hotels/shanghai/fairmont-peace-hotel/dining.html';
const mo='https://www.mandarinoriental.com/en/shanghai/pudong/dine';
const pen='https://www.peninsula.com/en/shanghai/hotel-fine-dining';
export const starterLife=[
 ['peace-jazz','The Jazz Bar — Fairmont Peace Hotel','music','venue',fair,'和平饭店官网列出的爵士酒吧。演出场次、入场要求和消费标准需再次确认。','A jazz venue listed by Fairmont Peace Hotel. Confirm performance times, entry rules and charges.'],
 ['cathay-room','The Cathay Room — Fairmont Peace Hotel','dining','venue',fair,'和平饭店官网列出的餐厅，可作为法式餐饮候选。订位条件和当前菜单待核实。','A restaurant listed by Fairmont Peace Hotel, with French dining described by the hotel. Current menus and booking conditions need confirmation.'],
 ['dragon-phoenix','Dragon Phoenix — Fairmont Peace Hotel','dining','venue',fair,'和平饭店官网列出的中餐厅，介绍包括上海及其他地方菜。','A Chinese restaurant listed by Fairmont Peace Hotel, describing Shanghai and other regional dishes.'],
 ['jasmine-lounge','Jasmine Lounge — Fairmont Peace Hotel','social','venue',fair,'官网介绍茶舞与爵士相关体验，具体活动日期、舞伴要求及价格待核实。','The hotel describes tea-dance and jazz experiences. Confirm individual dates, participation requirements and prices.'],
 ['victors-cafe',"Victor’s Café — Fairmont Peace Hotel",'dining','venue',fair,'和平饭店官网列出的咖啡餐饮场所，可作为轻食候选。','A café listed on the hotel dining page, a candidate for a casual meal.'],
 ['fifty8-grill','Fifty 8° Grill — Mandarin Oriental Pudong','dining','venue',mo,'上海浦东文华东方酒店官网列出的法式餐厅。','A French restaurant listed by Mandarin Oriental Pudong, Shanghai.'],
 ['yong-yi-ting','Yong Yi Ting — Mandarin Oriental Pudong','dining','venue',mo,'酒店官网以杭州菜介绍该餐厅，当前菜单及接待条件待确认。','The hotel describes Hangzhou cuisine. Confirm the current menu and visit arrangements.'],
 ['zest','Zest — Mandarin Oriental Pudong','dining','venue',mo,'酒店官网介绍亚洲及国际风味餐饮，不同餐段供应需核实。','The hotel lists Asian and international dining; confirm availability for the intended meal period.'],
 ['riviera-lounge','Riviera Lounge — Mandarin Oriental Pudong','dining','venue',mo,'酒店官网列出的会面与下午茶场所。','A hotel lounge listed for meetings and afternoon tea.'],
 ['qi-bar','Qi Bar — Mandarin Oriental Pudong','nightlife','venue',mo,'酒店官网介绍鸡尾酒与酒吧餐饮，年龄及入场要求待核实。','The hotel describes cocktails and bar food. Age and entry requirements need confirmation.'],
 ['mandarin-cake','The Mandarin Cake Shop — Mandarin Oriental Pudong','dining','venue',mo,'酒店官网列出的面包与甜点店，堂食及预订条件待确认。','A bakery and patisserie listed by the hotel; confirm seating and ordering arrangements.'],
 ['peninsula-lobby','The Lobby — The Peninsula Shanghai','dining','venue',pen,'上海半岛酒店官网列出的餐饮会面场所。','A dining and meeting venue listed by The Peninsula Shanghai.'],
 ['yi-long-court','Yi Long Court — The Peninsula Shanghai','dining','venue',pen,'上海半岛酒店官网列出的粤菜餐厅。','A Cantonese restaurant listed by The Peninsula Shanghai.'],
 ['sir-elly-restaurant',"Sir Elly’s Restaurant — The Peninsula Shanghai",'dining','venue',pen,'酒店当前官网介绍北意大利风味，菜单与价格需再次核实。','The current hotel page describes Northern Italian dining. Reconfirm menus and prices.'],
 ['sir-elly-terrace',"Sir Elly’s Terrace — The Peninsula Shanghai",'nightlife','venue',pen,'酒店官网列出的露台酒吧，开放条件及天气影响待确认。','A rooftop bar and terrace listed by the hotel. Confirm opening and weather-related conditions.'],
 ['compass-bar','The Compass Bar — The Peninsula Shanghai','nightlife','venue',pen,'酒店官网介绍经典鸡尾酒和酒吧餐饮。','The hotel describes classic cocktails and bar food.'],
 ['shanghai-museum-east','上海博物馆东馆 / Shanghai Museum East','culture','venue','https://www.shanghaimuseum.cn/mu/frontend/pg/en/service/visit-east','上海博物馆官方参观信息入口；预约、导览和证件要求需按到访日期确认。','Official Shanghai Museum East visitor information. Check booking, guiding and identity-document requirements for the visit date.'],
 ['shanghai-museum-peoples-square','上海博物馆人民广场馆 / Shanghai Museum People’s Square','family','venue','https://www.shanghaimuseum.cn/mu/frontend/pg/en/service/visit-west','上海博物馆人民广场馆官方参观信息入口，亲子安排与导览条件待核实。','Official visitor information for the People’s Square location. Confirm family visit and guiding arrangements.'],
 ['cook-in-shanghai-class','Cook in Shanghai — 烹饪课程候选','culture','activity','https://www.cookinshanghai.com/cooking-classes/public-cooking-classes/','主办方介绍的上海烹饪课程；未核实具体可报名场次，不作为已确认活动发布。','A cooking class described by its operator. No individual bookable session has been verified.'],
 ['pathways-pottery','Shanghai Pathways — 陶艺工作坊候选','culture','activity','https://www.shanghaipathways.com/chinese-pottery-workshop','主办方介绍的陶艺体验；具体日期、地址、教学语言和费用待核实。','A pottery experience described by the operator. Confirm dates, location, teaching language and fees.'],
] as const;
