type Example = { example: string; template?: string };
export type ContentFieldExamples = { zh: Example; en: Example };

export const exhibitionExamples = {
  edition: {
    zh: { example: "2027 年春季（第 3 届）" },
    en: { example: "Spring 2027 (3rd edition)" },
  },
  venue: {
    zh: { example: "示例会展中心 2 号馆" },
    en: { example: "Hall 2, Example Convention Centre" },
  },
  address: {
    zh: { example: "上海市示例区示例路 18 号，南门入场" },
    en: { example: "South Entrance, 18 Example Road, Example District, Shanghai" },
  },
  addressEn: {
    zh: { example: "上海市示例区示例路 18 号，南门入场" },
    en: { example: "South Entrance, 18 Example Road, Example District, Shanghai" },
  },
  audience: {
    zh: {
      example: "面向采购商、品牌方及行业从业人员。",
      template: "面向〔观众类型〕。〔专业观众或公众的到访限制〕。",
    },
    en: {
      example: "For buyers, brands and trade professionals.",
      template: "For 〔visitor groups〕. 〔Trade or public access restrictions〕.",
    },
  },
  exhibits: {
    zh: {
      example: "展品包括工业紧固件、工具和检测设备。",
      template: "展品包括〔类别一〕、〔类别二〕及〔其他类别〕。",
    },
    en: {
      example: "Exhibits include fasteners, tools and testing equipment.",
      template:
        "Exhibits include 〔first category〕, 〔second category〕 and 〔other categories〕.",
    },
  },
  admission: {
    zh: {
      example: "通过主办方网站登记，凭报名确认邮件入场。",
      template: "请通过〔主办方报名渠道〕登记，并按要求出示〔入场凭证〕。费用：〔官方说明〕。",
    },
    en: {
      example: "Register on the organiser’s website and show the confirmation email at entry.",
      template:
        "Register via 〔official channel〕 and bring 〔proof of registration〕. Fee: 〔official details〕.",
    },
  },
  unresolved: {
    zh: {
      example: "展区分布待主办方公布。",
      template: "〔待确认事项〕尚未公布。请关注〔官方信息渠道〕。",
    },
    en: {
      example: "The organiser has yet to publish the hall plan.",
      template:
        "〔Pending details〕 have yet to be announced. Check 〔official channel〕 for updates.",
    },
  },
} satisfies Record<string, ContentFieldExamples>;

export const projectExamples = {
  capabilities: {
    zh: { example: "提供采购会议的现场交替口译。" },
    en: { example: "Interpreting during scheduled meetings." },
  },
  audience: {
    zh: { example: "需要与供应商当面沟通的海外采购团队。" },
    en: { example: "Overseas buying teams meeting suppliers in person." },
  },
  includes: {
    zh: {
      example: "含约定时段的现场口译及会前术语确认。",
      template: "包含〔服务范围〕及〔交付内容〕，适用于〔已确认条件〕。",
    },
    en: {
      example: "Includes scheduled on-site interpreting and a pre-meeting terminology check.",
      template:
        "Includes 〔scope of service〕 and 〔deliverables〕 under 〔confirmed conditions〕.",
    },
  },
  excludes: {
    zh: { example: "不含门票、交通费和会后笔译。" },
    en: { example: "Admission, transport and written translation are excluded." },
  },
  process: {
    zh: {
      example: "预约前确认日期和地点；会前核对议程；按确认时间到场。",
      template: "1. 确认〔需求和安排〕。\n2. 按约定提供〔服务〕。\n3. 交付〔约定成果〕。",
    },
    en: {
      example: "Confirm the date and venue, check the agenda, then meet at the agreed time.",
      template:
        "1. Confirm 〔requirements and arrangements〕.\n2. Provide 〔service〕.\n3. Deliver 〔agreed output〕.",
    },
  },
  deliverables: {
    zh: { example: "现场口译，以及会后整理的中英文术语表。" },
    en: { example: "On-site interpreting and a bilingual glossary after the meeting." },
  },
  materials: {
    zh: { example: "提供会议议程、常用术语及联系人沟通语言。" },
    en: { example: "Provide the agenda, relevant terminology and preferred contact language." },
  },
  bookingNotice: {
    zh: {
      example: "建议提前 3 个工作日预约，具体档期以确认结果为准。",
      template: "建议提前〔时间〕预约。〔特殊日期或紧急请求的安排〕。",
    },
    en: {
      example: "Request a booking three business days ahead, subject to availability.",
      template:
        "Request a booking 〔lead time〕 in advance. 〔Rules for peak dates or urgent requests〕.",
    },
  },
  duration: {
    zh: { example: "每场最多 2 小时，延长须提前确认。" },
    en: { example: "Up to two hours per session. Confirm extensions in advance." },
  },
  people: {
    zh: { example: "适合 1–4 人的采购团队；更多人数请先咨询。" },
    en: { example: "For teams of one to four. Enquire in advance for larger groups." },
  },
  changes: {
    zh: {
      example: "改期请至少提前 1 个工作日联系，费用依已确认的条款。",
      template: "请提前〔通知时间〕提出改期或取消。费用按〔已核实的变更或取消条款〕处理。",
    },
    en: {
      example: "Request changes at least one business day ahead. Agreed terms apply.",
      template:
        "Give 〔notice period〕 for changes or cancellations. Charges follow 〔confirmed terms〕.",
    },
  },
} satisfies Record<string, ContentFieldExamples>;

export const projectPriceExamples = {
  unit: {
    zh: { example: "每场（最多 2 小时）" },
    en: { example: "Per session (up to two hours)" },
  },
  conditions: {
    zh: { example: "适用于工作日市区服务；交通和超时另计。" },
    en: { example: "For weekday service in the city. Travel and overtime are charged separately." },
  },
} satisfies Record<string, ContentFieldExamples>;

export const institutionExamples = {
  address: exhibitionExamples.address,
  addressEn: exhibitionExamples.addressEn,
  directions: {
    zh: { example: "提供预约制康复评估，具体服务范围以机构公开资料为准。" },
    en: { example: "Rehabilitation assessments by appointment, as listed by the institution." },
  },
  audience: {
    zh: { example: "适合预约成人康复评估的访客。" },
    en: { example: "For visitors booking adult rehabilitation assessments." },
  },
  appointment: {
    zh: {
      example: "通过机构官网预约。预约成功后按确认信息到访。",
      template: "通过〔机构官方预约渠道〕预约。到访前请确认〔接待时段和预约条件〕。",
    },
    en: {
      example:
        "Book on the institution’s website and follow the visit instructions in the confirmation.",
      template:
        "Book through 〔official channel〕. Confirm 〔hours and appointment requirements〕 before visiting.",
    },
  },
  preparation: {
    zh: { example: "到访前查看机构的预约确认和随身材料要求。" },
    en: {
      example: "Review the booking confirmation and the institution’s list of documents to bring.",
    },
  },
  fees: {
    zh: { example: "费用按机构公开价目表执行，费用项目在预约前确认。" },
    en: {
      example: "See the institution’s published price list and confirm charges before booking.",
    },
  },
  acceptanceConditions: {
    zh: { example: "已核实：外籍访客须提前预约，指定时段接待。" },
    en: {
      example:
        "Verified: international visitors are received by appointment during designated hours.",
    },
  },
  interpretation: {
    zh: { example: "机构口译安排待确认；需要华伴协调时请在咨询中说明语言需求。" },
    en: {
      example:
        "Institutional interpreting is unconfirmed. Tell Hua Companion which language you need.",
    },
  },
  qualification: {
    zh: { example: "根据公开登记页面核对机构名称和登记范围，来源见下方。" },
    en: {
      example:
        "The institution’s name and registered scope were checked against the public register below.",
    },
  },
  unresolved: {
    zh: {
      example: "周末是否可以使用英语接待仍待核实。",
      template: "〔待核实事项〕尚未确认。以〔机构官方信息渠道〕的最新说明为准。",
    },
    en: {
      example: "English-language reception on weekends remains unconfirmed.",
      template:
        "〔Unverified detail〕 remains unconfirmed. Check 〔official institution channel〕 for updates.",
    },
  },
} satisfies Record<string, ContentFieldExamples>;

export const overviewExamples = {
  exhibition: {
    title: {
      zh: { example: "示例工业配件展（2027 年春季）" },
      en: { example: "Example Industrial Parts Expo, Spring 2027" },
    },
    summary: {
      zh: { example: "面向采购商，汇集工业配件和检测设备展商。" },
      en: { example: "An exhibition of industrial parts and testing equipment for buyers." },
    },
  },
  "service-project": {
    title: {
      zh: { example: "上海采购会议口译" },
      en: { example: "Interpreting for Buying Meetings in Shanghai" },
    },
    summary: {
      zh: { example: "为采购团队提供预约制现场口译，适用人数及语言见服务规格。" },
      en: {
        example:
          "Book on-site interpreting for a buying team. See the supported languages and group size below.",
      },
    },
  },
  institution: {
    title: { zh: { example: "示例康复中心" }, en: { example: "Example Rehabilitation Centre" } },
    summary: {
      zh: { example: "提供预约制康复评估。外籍访客接待条件见机构资料。" },
      en: {
        example:
          "Rehabilitation assessments by appointment. See the entry below for international visitor requirements.",
      },
    },
  },
} satisfies Record<string, Record<"title" | "summary", ContentFieldExamples>>;

export const housekeepingExamples = {
  districts: {
    zh: { example: "服务覆盖示例区，其他区域请提前确认。" },
    en: { example: "Service covers Example District. Check availability for other areas." },
  },
  staffing: {
    zh: { example: "由已确认的服务方安排人员，到访前确认人数及到达时间。" },
    en: {
      example: "The confirmed provider assigns staff. Check headcount and arrival time beforehand.",
    },
  },
  scope: {
    zh: { example: "常规保洁包含地面和可触及台面的清洁。" },
    en: { example: "Regular cleaning covers floors and accessible worktops." },
  },
  exclusions: {
    zh: { example: "不包含高空外窗和大型物品搬运。" },
    en: { example: "High exterior windows and moving large items are excluded." },
  },
  pricing: {
    zh: { example: "按预约时段计价；额外项目费用提前确认。" },
    en: { example: "Rates are based on the booked time. Confirm any extra charges in advance." },
  },
  equipment: {
    zh: { example: "常规清洁工具由服务方提供；特殊用品请提前确认。" },
    en: { example: "The provider brings standard tools. Confirm any special supplies in advance." },
  },
  pets: {
    zh: { example: "有宠物时请提前告知，确认服务期间如何隔离宠物。" },
    en: {
      example:
        "Tell the provider about pets in advance and agree where they will stay during the visit.",
    },
  },
  entry: {
    zh: { example: "由客户或已约定的人员开门，进出时间提前确认。" },
    en: {
      example:
        "The customer or an agreed person lets staff in. Confirm arrival and departure times.",
    },
  },
  aftercare: {
    zh: {
      example: "发现遗漏时，请联系华伴说明服务日期与具体项目。",
      template: "如需反馈，请通过〔渠道〕提供〔必要信息〕。处理方式见〔售后约定〕。",
    },
    en: {
      example: "Report missed work to Hua Companion with the service date and task details.",
      template:
        "Use 〔contact channel〕 to provide 〔required details〕. See 〔aftercare terms〕 for next steps.",
    },
  },
  insurance: {
    zh: { example: "保险范围及适用条件尚未核实，请在预约前确认。" },
    en: { example: "Insurance coverage and conditions are unverified. Check them before booking." },
  },
  languageEvidence: {
    zh: { example: "已核实可用英语预约；上门人员的工作语言待确认。" },
    en: {
      example: "Booking in English is confirmed. On-site staff language support is unverified.",
    },
  },
} satisfies Record<string, ContentFieldExamples>;
