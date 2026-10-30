import type { Locale } from "./routes";
import {homePair} from "./housekeeping-copy.ts";
import { coreText } from "./core-copy.ts";
export type Pair = Record<Locale, string>;
export const p = (en: string, zh: string): Pair => ({ en, zh, es: coreText("es",en), fr: coreText("fr",en), de: coreText("de",en), it: coreText("it",en), ar: coreText("ar",en) });
export type Service = {
  slug: string;
  title: Pair;
  short: Pair;
  intro: Pair;
  items: Pair[];
  boundary: Pair;
  prepare: Pair;
  icon: string;
};
export const services: Service[] = [
  {slug:"housekeeping",icon:"stays",title:homePair("title"),short:homePair("intro"),intro:homePair("intro"),items:[homePair("regular"),homePair("deep"),homePair("move-in")],boundary:homePair("boundary"),prepare:homePair("notice")},
  {
    slug: "medical",
    icon: "medical",
    title: p("Medical visit coordination", "医疗机构对接"),
    short: p(
      "A little clarity, when it matters most.",
      "重要时刻，多一份清晰与安心。",
    ),
    intro: p(
      "Navigate the practical side of a medical visit in China, from contacting institutions to arranging language and travel support.",
      "从联系医疗机构到语言、交通与住宿安排，协助您理清在中国就医的实际流程。",
    ),
    items: [
      p(
        "Contact hospitals and international service departments; ask about appointment requirements.",
        "联系医院及国际服务部门，查询预约要求与接诊流程。",
      ),
      p(
        "Coordinate appointments and, with authorization, the transfer of necessary information.",
        "协助预约，并在授权后通过受控流程传递必要资料。",
      ),
      p(
        "Arrange professional medical interpretation and appointment accompaniment.",
        "对接专业医疗翻译与就诊流程陪同。",
      ),
      p(
        "Coordinate accommodation, transport and family arrangements; help with report collection and follow-up contact.",
        "协调住宿、交通与家属行程，协助报告领取及后续联系。",
      ),
    ],
    boundary: p(
      "We coordinate practical arrangements. Medical institutions are responsible for diagnosis and treatment. We do not recommend treatment or promise outcomes or acceptance. Do not submit medical records or detailed medical history here.",
      "华伴提供协调服务，诊断与治疗由医疗机构负责。我们不推荐治疗方案，不承诺疗效或接诊结果。请勿在本网站提交病历或详细病史。",
    ),
    prepare: p(
      "Preferred city, approximate dates, communication language and the type of coordination needed.",
      "希望就医的城市、预计日期、沟通语言及需要的协调类型。",
    ),
  },
  {
    slug: "business",
    icon: "business",
    title: p("Exhibitions & business visits", "展会与商务访问"),
    short: p(
      "Make room for the conversations that matter.",
      "让精力留给真正重要的商务沟通。",
    ),
    intro: p(
      "Practical support for visiting exhibitions, exhibiting and meeting businesses in China, with particular familiarity with hardware and electrical products.",
      "为参观展会、企业参展和商务访问提供协调支持，并发挥五金与电器行业的经验。",
    ),
    items: [
      p(
        "For buyers: exhibition information, registration guidance, itineraries and interpretation.",
        "买家观展：展会信息整理、报名流程指引、行程及翻译。",
      ),
      p(
        "For exhibitors: introductions to organizers, booth providers, stand builders and exhibit logistics services.",
        "企业参展：主办方、展位、搭建及展品物流服务商对接。",
      ),
      p(
        "For business and factory visits: appointments, meetings, transport and follow-up notes.",
        "商务与工厂访问：预约、会议、交通、翻译和会后事项整理。",
      ),
      p(
        "Hardware and electrical product visits informed by the founder’s experience selling Chinese-made products on Amazon.",
        "结合创始人在亚马逊销售中国制造五金、电器的经验，协助整理访问重点；同时欢迎其他行业需求。",
      ),
    ],
    boundary: p(
      "Visit coordination is not a factory audit, supplier credit guarantee or product quality certification. Access and appointments remain subject to the host’s confirmation.",
      "访问协调不等于验厂认证、供应商信用担保或产品质量保证。访问权限与预约以接待方确认为准。",
    ),
    prepare: p(
      "Industry, products, exhibition or companies of interest, visit goals and preferred dates.",
      "行业、产品、目标展会或企业、访问目的及预计日期。",
    ),
  },
  {
    slug: "transport",
    icon: "transport",
    title: p("Airport transfers & transport", "接送机与交通"),
    short: p(
      "From arrival to the next destination.",
      "从抵达开始，衔接每一段行程。",
    ),
    intro: p(
      "Coordinate the journeys between airports, stations, hotels, hospitals, exhibitions and factories.",
      "协调机场、车站、酒店、医院、展馆与工厂之间的交通。",
    ),
    items: [
      p(
        "Airport and railway station pickups and drop-offs.",
        "机场与火车站接送。",
      ),
      p(
        "Point-to-point, hourly and full-day vehicle arrangements.",
        "点对点接送、按小时或按天用车。",
      ),
      p(
        "Cross-city journeys and group vehicle coordination.",
        "跨城行程及团队车辆协调。",
      ),
      p(
        "Confirm luggage space, child seats and accessibility requests with the actual provider.",
        "向实际服务商确认行李空间、儿童座椅与无障碍需求。",
      ),
    ],
    boundary: p(
      "The quote must specify waiting time, overtime, parking, tolls and cancellation terms. Special equipment and accessibility requests are subject to explicit confirmation.",
      "报价须明确等待时间、超时费用、停车路桥费和取消规则。儿童座椅等设备及无障碍需求须单独确认。",
    ),
    prepare: p(
      "Arrival details, pickup and drop-off locations, party size and luggage.",
      "抵达信息、上下车地点、人数与行李情况。",
    ),
  },
  {
    slug: "stays",
    icon: "stays",
    title: p("Hotels & longer stays", "酒店与长期住宿"),
    short: p(
      "Find a place that fits your time here.",
      "短暂停留或长住，都更贴近您的需要。",
    ),
    intro: p(
      "Explore accommodation suited to the length and purpose of your visit, with practical help to clarify the details before you decide.",
      "根据停留时长与来华目的整理住宿需求，在决定前协助确认实际条件。",
    ),
    items: [
      p(
        "Hotels and short stays, including family rooms.",
        "酒店、短期住宿及家庭房需求。",
      ),
      p(
        "Serviced apartments and weekly or monthly stays.",
        "服务式公寓、周租及月租。",
      ),
      p(
        "Introductions to long-term rental agencies, viewing coordination and move-in handover assistance.",
        "长期租赁机构对接、看房与入住交接协助。",
      ),
      p(
        "Confirm kitchens, laundry facilities, accessibility and location preferences.",
        "确认厨房、洗衣、无障碍设施与区域偏好。",
      ),
    ],
    boundary: p(
      "Availability and rates are confirmed individually. Long-term deposits, lease length, service fees and move-out conditions require separate agreement.",
      "房态与价格逐项确认。长租押金、租期、服务费及退租事项需单独约定。",
    ),
    prepare: p(
      "Short or long stay, dates, preferred area, room needs, facilities and optional budget.",
      "短住或长租、日期、区域、房型、设施要求与可选预算。",
    ),
  },
  {
    slug: "travel",
    icon: "travel",
    title: p("Travel & cultural experiences", "旅游机构对接"),
    short: p(
      "Discover a different side of China.",
      "在行程之外，遇见中国的日常。",
    ),
    intro: p(
      "Tell us what interests you. We help connect your ideas with travel providers and confirm what can be arranged.",
      "告诉我们您的兴趣，我们协助对接旅游服务机构，逐项确认可安排的体验。",
    ),
    items: [
      p("Shanghai city visits and nearby excursions.", "上海城市游及周边游。"),
      p(
        "Multi-city itineraries, family trips and small-group activities.",
        "多城市行程、家庭及小团体活动。",
      ),
      p(
        "Culture, food, museums and hands-on craft experiences.",
        "文化、美食、博物馆与手工体验。",
      ),
      p(
        "Multilingual guide introductions and special-requirement coordination.",
        "多语言导游与特殊需求对接。",
      ),
    ],
    boundary: p(
      "The actual operating provider, itinerary, inclusions and cancellation terms will be stated in the confirmed proposal. No provider relationship is implied by this page.",
      "实际承接机构、行程、包含事项及取消规则以确认方案为准。本页面不表示已与任何机构建立合作。",
    ),
    prepare: p(
      "Destinations, interests, dates and who is travelling with you.",
      "目的地、兴趣、日期及同行人员情况。",
    ),
  },
  {
    slug: "interpretation",
    icon: "interpretation",
    title: p("Interpretation & accompaniment", "翻译与陪同"),
    short: p(
      "A shared understanding starts here.",
      "让沟通更清楚，让同行更从容。",
    ),
    intro: p(
      "Coordinate language support for business, exhibitions, medical appointments and everyday situations.",
      "为商务、展会、医疗就诊及日常场景协调语言支持。",
    ),
    items: [
      p(
        "Business meetings and exhibition interpretation.",
        "商务会议与展会翻译。",
      ),
      p(
        "Professional medical interpreter introductions.",
        "专业医疗翻译对接。",
      ),
      p(
        "Everyday communication and practical accompaniment.",
        "日常沟通及流程陪同。",
      ),
      p(
        "Confirm language pairs, subject knowledge, hours and confidentiality requirements.",
        "确认语言组合、专业领域、时长与保密要求。",
      ),
    ],
    boundary: p(
      "Interpreter availability and suitability are confirmed for each request. Language support does not replace professional medical, legal or technical advice.",
      "译员档期与专业匹配须逐项确认。语言支持不能替代医疗、法律或技术专业意见。",
    ),
    prepare: p(
      "Languages, setting, subject, dates and expected duration.",
      "语言、场景、专业主题、日期与预计时长。",
    ),
  },
  {
    slug: "arrival",
    icon: "arrival",
    title: p("Arrival & everyday essentials", "来华准备与生活协助"),
    short: p(
      "Settle into the everyday, a little sooner.",
      "更快熟悉在中国的日常。",
    ),
    intro: p(
      "Practical preparation and everyday orientation for your time in China.",
      "为来华准备与在华日常生活提供实用信息整理与流程协助。",
    ),
    items: [
      p(
        "A preparation checklist tailored to the purpose of your visit.",
        "根据来华目的整理行前清单。",
      ),
      p(
        "Guidance on communication options and local transport.",
        "通信方式与城市交通使用指引。",
      ),
      p(
        "Guidance on payment-service setup using official instructions.",
        "依据官方说明提供支付工具使用指引。",
      ),
      p(
        "Help identifying information that needs to be checked with the relevant provider.",
        "协助识别需要向实际服务机构进一步核实的信息。",
      ),
    ],
    boundary: p(
      "We never take control of financial accounts, passwords or verification codes. Eligibility and policies must be checked with the relevant official service.",
      "不代管金融账户、密码或验证码。使用资格及政策须向相关官方服务核实。",
    ),
    prepare: p(
      "Your destination, preferred language and the everyday tasks you would like help with.",
      "目的地、沟通语言与希望获得协助的日常事项。",
    ),
  },
];
export const guideCategories = [
  p("All guides", "全部指南"),
  p("Before you arrive", "行前准备"),
  p("Business visits", "商务参展"),
  p("Medical visits", "就医流程"),
  p("Getting around", "交通"),
  p("Staying in China", "住宿"),
  p("Culture & daily life", "文化与生活"),
];
export const guides = [
  {
    slug: "before-you-arrive",
    category: 1,
    title: p(
      "A calmer arrival starts before you leave",
      "把抵达前的准备，提前安排好",
    ),
    desc: p(
      "A practical checklist for organising the details of your visit.",
      "从行程与联系方式开始，整理一份清楚的行前清单。",
    ),
    read: 4,
    sections: [
      p("Keep your itinerary together", "集中整理行程"),
      p(
        "Write down accommodation addresses in Chinese and English, transport details and the contact information of each confirmed provider. Keep a copy accessible without a network connection.",
        "整理住宿地址的中英文版本、交通信息及已确认服务商的联系方式，保留可离线查看的副本。",
      ),
      p("Confirm with the official source", "向官方来源确认"),
      p(
        "Check entry requirements, carrier rules and service eligibility directly with the appropriate authorities and providers for your nationality and dates. This checklist does not determine visa or entry eligibility.",
        "根据国籍与行程日期，向有关主管机构及实际服务商核实入境要求、承运规则与使用资格。本清单不判断签证或入境资格。",
      ),
      p("Leave space for changes", "给变化留出余地"),
      p(
        "Share approximate arrival times and any access needs early. Ask how delays, cancellations and after-hours arrivals will be handled before confirming arrangements.",
        "提前说明预计抵达时间与便利性需求，在确认安排前了解延误、取消和非营业时间抵达的处理方式。",
      ),
    ],
  },
  {
    slug: "business-visit-brief",
    category: 2,
    title: p(
      "Make your business visit brief work harder",
      "一份清楚的商务访问需求，应该包含什么",
    ),
    desc: p(
      "What to prepare before an exhibition or factory visit.",
      "出发前厘清产品、目标与访问安排。",
    ),
    read: 3,
    sections: [
      p("Start with the purpose", "从访问目的开始"),
      p(
        "List the products or sectors of interest and the outcome you hope to achieve. Distinguish an introductory meeting from technical discussions or commercial negotiation.",
        "列出关注的产品或行业以及希望达成的目标，区分初次交流、技术讨论和商务谈判。",
      ),
      p("Confirm access and language", "确认访问与语言"),
      p(
        "Appointments, exhibition admission and factory access need confirmation from the relevant host. Share interpretation languages, technical vocabulary and confidentiality needs in advance.",
        "预约、展会入场和工厂访问需由相应接待方确认。提前说明翻译语言、专业术语及保密要求。",
      ),
      p("Separate coordination from verification", "区分协调与专业核验"),
      p(
        "A coordinated visit does not certify a supplier or guarantee quality. If you need a professional audit or inspection, specify it separately and confirm the qualified provider and scope.",
        "协调访问不代表供应商认证或质量保证。如需专业审核或检验，应单独说明并确认具备相应能力的服务商及工作范围。",
      ),
    ],
  },
  {
    slug: "medical-visit-process",
    category: 3,
    title: p(
      "Understanding medical visit coordination",
      "了解医疗就诊协调的边界与流程",
    ),
    desc: p(
      "Appointments, interpretation and practical arrangements.",
      "预约、语言支持与配套安排如何衔接。",
    ),
    read: 4,
    sections: [
      p("Begin with practical needs", "先说明协调需求"),
      p(
        "At the initial enquiry, share only city, dates, language and the type of help needed. Do not include detailed medical history, identification numbers or records in a general contact form.",
        "初步咨询仅说明城市、日期、语言及所需协助类型。不要在普通联系表单中填写详细病史、证件号码或病历内容。",
      ),
      p("Let the institution confirm", "由医疗机构确认"),
      p(
        "Appointment requirements, clinical suitability and treatment decisions belong to the medical institution. Coordination cannot guarantee acceptance or a particular outcome.",
        "预约要求、接诊适宜性和诊疗决策由医疗机构负责。协调服务不能保证接诊或特定结果。",
      ),
      p("Confirm supporting arrangements separately", "分别确认配套安排"),
      p(
        "Accommodation, transport and interpretation may involve different providers. Ask who delivers each service, who contracts and collects payment, and what the cancellation terms are.",
        "住宿、交通与翻译可能由不同服务方提供。逐项确认服务方、签约方、收款方与取消规则。",
      ),
    ],
  },
  {
    slug: "transfer-checklist",
    category: 4,
    title: p(
      "The details that make a transfer easier",
      "接送安排前，先确认这几件事",
    ),
    desc: p(
      "Pickup points, luggage and the cost of waiting.",
      "上下车地点、行李与等候规则。",
    ),
    read: 3,
    sections: [
      p("Share the journey details", "说明具体行程"),
      p(
        "Provide the flight or train details, terminal or station, pickup and destination addresses, passenger count and luggage. Update the provider if these change.",
        "提供航班或车次、航站楼或车站、上下车地址、人数与行李；变更时及时告知服务商。",
      ),
      p("Check the quote", "核对报价"),
      p(
        "Ask about included waiting time, delay handling, overtime, parking, tolls and cancellation. Confirm how you will identify and contact the driver.",
        "询问已包含的等候时间、延误处理、超时、停车路桥费及取消规则，确认如何辨认和联系司机。",
      ),
      p("Confirm special requirements", "确认特殊需求"),
      p(
        "Child seats, wheelchair access and unusual luggage need explicit confirmation. Do not assume equipment is included unless it appears in the agreed arrangement.",
        "儿童座椅、轮椅通行及特殊行李需明确确认，不能因提出需求就默认设备已经安排。",
      ),
    ],
  },
  {
    slug: "choosing-your-stay",
    category: 5,
    title: p("A short visit or a longer stay?", "短住与长租，需求应该怎样整理"),
    desc: p(
      "Two different stays, two different sets of questions.",
      "两种住宿方式，各有需要确认的细节。",
    ),
    read: 3,
    sections: [
      p("For a short stay", "短期住宿"),
      p(
        "Clarify dates, room occupancy, location, accessibility and facilities such as a kitchen or laundry. Confirm the actual room terms before booking.",
        "说明日期、入住人数、区域、无障碍要求与厨房洗衣设施；预订前确认实际房型条款。",
      ),
      p("For a longer stay", "长期住宿"),
      p(
        "Discuss lease length, deposit, service fees, included utilities, move-in handover and move-out conditions separately. Ask the actual contracting party for written terms.",
        "分别确认租期、押金、服务费、水电等费用、入住交接和退租条件，向实际签约方获取书面约定。",
      ),
      p("Keep availability separate from preference", "偏好不等于可订"),
      p(
        "A requested area or amenity is a preference until the provider confirms availability. Review alternatives and cancellation rules before making a commitment.",
        "提出区域或设施需求后，仍需服务商确认可用性。决定前了解替代方案与取消规则。",
      ),
    ],
  },
  {
    slug: "everyday-confidence",
    category: 6,
    title: p("Finding your rhythm in a new city", "慢慢熟悉一座城市的日常"),
    desc: p(
      "Small preparations for communication and daily life.",
      "从通信、出行与日常沟通开始。",
    ),
    read: 3,
    sections: [
      p("Keep useful addresses close", "随手保存常用地址"),
      p(
        "Keep the address of your accommodation and planned destinations in both languages. Save important contact details in a format you can access offline.",
        "保存住处及目的地的双语地址，并离线留存重要联系方式。",
      ),
      p("Use official instructions", "按官方说明操作"),
      p(
        "Check communication and payment services directly with their official providers. Requirements can vary; confirm what applies to you rather than relying on another traveller’s experience.",
        "向通信和支付服务的官方提供方核实使用要求。不同情况可能适用不同规则，不宜直接套用他人的经验。",
      ),
      p("Keep control of your accounts", "自己掌握账户"),
      p(
        "Never hand over passwords or verification codes to someone helping you. Hua Companion does not take custody of financial accounts or login credentials.",
        "不要向协助人员提供密码或验证码。华伴不代管金融账户或登录凭证。",
      ),
    ],
  },
];
export const faqs = [
  [
    p(
      "Do I need to know exactly which services I need?",
      "还没确定需要哪些服务，可以咨询吗？",
    ),
    p(
      "No. Share your purpose, approximate dates and any priorities. We can help clarify the request before preparing a proposal.",
      "可以。告诉我们来华目的、预计日期和主要关注事项，我们会先协助整理需求，再确认可提供的方案。",
    ),
  ],
  [
    p("Do you operate throughout China?", "是否提供全国服务？"),
    p(
      "Shanghai is our starting point. Other locations are considered according to your request and the resources that can be confirmed. We do not promise nationwide availability.",
      "我们以上海为起点，其他地区根据需求与可确认资源评估，不承诺全国均可交付。",
    ),
  ],
  [
    p(
      "Who provides the service and receives payment?",
      "由谁提供服务、签约和收款？",
    ),
    p(
      "This is specified for each item in your proposal. We may introduce an independent provider or coordinate a wider arrangement where the necessary operating conditions are met. Fees and responsibilities are explained before confirmation.",
      "方案会逐项写明实际服务方、签约方和收款方。可采用合作对接，或在具备相应经营条件后由华伴统筹；费用与责任在确认前说明。",
    ),
  ],
  [
    p("Is a medical appointment guaranteed?", "能保证医疗预约或接诊吗？"),
    p(
      "No. Acceptance and medical decisions are made by the institution. We provide coordination, not diagnosis, treatment recommendations or outcome guarantees.",
      "不能。接诊和医疗决策由医疗机构负责。我们提供协调，不做诊断、不推荐治疗，也不承诺疗效。",
    ),
  ],
  [
    p("Can my organisation apply to collaborate?", "我的机构可以申请合作吗？"),
    p(
      "Yes. Submit a capability introduction for review. An application does not establish a partnership, and names or logos are not published without verification and separate permission.",
      "欢迎提交服务能力介绍。申请需审核，不自动建立合作关系；未经核实及独立授权，不公开机构名称或标志。",
    ),
  ],
];
export const nav = [
  p("Home", "首页"),
  p("Services", "来华服务"),
  p("Providers", "服务商"),
  p("Exhibitions", "展会"),
  p("Institutions", "医疗康养"),
  p("City life & experiences", "城市生活与体验"),
  p("Knowledge centre", "知识中心"),
  p("Partners", "合作伙伴"),
  p("About us", "关于华伴"),
  p("Contact", "联系我们"),
];
export const navPaths = [
  "",
  "services",
  "providers",
  "exhibitions",
  "institutions",
  "life",
  "guides",
  "partners",
  "about",
  "contact",
];
export const t = (value: Pair, locale: Locale) => value[locale];
