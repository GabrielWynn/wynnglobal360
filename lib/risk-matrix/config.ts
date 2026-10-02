// ---------------------------------------------------------------------------
// Matriz de Riesgo PLAyFT — methodology configuration.
// Dependency-free so it can be imported from both server and client code.
// Any change to weights, catalogues, bands or rules must bump `version`.
// ---------------------------------------------------------------------------

export type Riesgo = "Bajo" | "Medio" | "Alto";

export interface CatalogItem {
  valor: string;
  riesgo: Riesgo;
}

export interface Subfactor {
  subfactor: string;
  ponderacion_interna: number;
  ponderacion_efectiva: number;
}

export interface Factor {
  factor: string;
  ponderacion: number;
  subfactores: Subfactor[];
}

export interface Banda {
  desde: number;
  rango: string;
  riesgo: Riesgo;
}

export interface Pais {
  pais: string;
  iso2: string | null;
  riesgo: Riesgo;
}

export interface TipoDeCambio {
  moneda: string;
  usd_por_unidad: number;
  fecha: string;
  fuente: string;
}

export interface DebidaDiligencia {
  clasificacion: string;
  nivel: string;
  revision_meses: number | null;
}

const B: Riesgo = "Bajo";
const M: Riesgo = "Medio";
const A: Riesgo = "Alto";

const cat = (riesgo: Riesgo, valores: string[]): CatalogItem[] =>
  valores.map((valor) => ({ valor, riesgo }));

const PAISES: Array<[string, string | null, Riesgo]> = [
  ["Afganistán", "AF", A], ["Albania", "AL", M], ["Alemania", "DE", B], ["Andorra", "AD", B],
  ["Angola", "AO", M], ["Antigua y Barbuda", "AG", M], ["Arabia Saudita", "SA", B], ["Argelia", "DZ", M],
  ["Argentina", "AR", M], ["Armenia", "AM", M], ["Australia", "AU", B], ["Austria", "AT", B],
  ["Azerbaiyán", "AZ", M], ["Bahamas", "BS", M], ["Bangladés", "BD", M], ["Barbados", "BB", M],
  ["Baréin", "BH", M], ["Bélgica", "BE", B], ["Belice", "BZ", M], ["Benín", "BJ", M],
  ["Bielorrusia", "BY", M], ["Birmania/ Myanmar", "MM", A], ["Bolivia", "BO", M], ["Bosnia y Herzegovina", "BA", M],
  ["Botsuana", "BW", B], ["Brasil", "BR", M], ["Brunéi", "BN", B], ["Bulgaria", "BG", M],
  ["Burkina Faso", "BF", M], ["Burundi", "BI", M], ["Bután", "BT", M], ["Cabo Verde", "CV", M],
  ["Camboya", "KH", M], ["Camerún", "CM", M], ["Canadá", "CA", B], ["Catar/Qatar", "QA", B],
  ["Chad", "TD", M], ["Chile", "CL", B], ["China", "CN", M], ["Chipre", "CY", M],
  ["Ciudad del Vaticano", "VA", B], ["Colombia", "CO", M], ["Comoras", "KM", M], ["Corea del Norte", "KP", A],
  ["Corea del Sur", "KR", B], ["Costa de Marfil", "CI", M], ["Costa Rica", "CR", M], ["Croacia", "HR", M],
  ["Cuba", "CU", M], ["Dinamarca", "DK", B], ["Dominica", "DM", M], ["Ecuador", "EC", M],
  ["Egipto", "EG", M], ["El Salvador", "SV", M], ["Emiratos Árabes Unidos", "AE", M], ["Eritrea", "ER", M],
  ["Eslovaquia", "SK", B], ["Eslovenia", "SI", M], ["España", "ES", B], ["Estados Unidos", "US", B],
  ["Estonia", "EE", B], ["Etiopía", "ET", M], ["Filipinas", "PH", M], ["Finlandia", "FI", B],
  ["Fiyi", "FJ", M], ["Francia", "FR", B], ["Gabón", "GA", M], ["Gambia", "GM", M],
  ["Georgia", "GE", B], ["Ghana", "GH", M], ["Granada", "GD", M], ["Grecia", "GR", B],
  ["Guatemala", "GT", M], ["Guinea", "GN", M], ["Guinea Ecuatorial", "GQ", M], ["Guinea-Bisáu", "GW", M],
  ["Guyana", "GY", M], ["Haití", "HT", A], ["Honduras", "HN", M], ["Hungría", "HU", B],
  ["India", "IN", M], ["Indonesia", "ID", M], ["Irak", "IQ", M], ["Irán", "IR", A],
  ["Irlanda", "IE", B], ["Islandia", "IS", B], ["Islas Marshall", "MH", M], ["Islas Salomón", "SB", M],
  ["Israel", "IL", M], ["Italia", "IT", B], ["Jamaica", "JM", M], ["Japón", "JP", B],
  ["Jordania", "JO", B], ["Kazajistán", "KZ", B], ["Kenia", "KE", M], ["Kirguistán", "KG", M],
  ["Kiribati", "KI", M], ["Kuwait", "KW", M], ["Laos", "LA", M], ["Lesoto", "LS", M],
  ["Letonia", "LV", B], ["Líbano", "LB", M], ["Liberia", "LR", M], ["Libia", "LY", M],
  ["Liechtenstein", "LI", B], ["Lituania", "LT", B], ["Luxemburgo", "LU", B], ["Macedonia del Norte", "MK", M],
  ["Madagascar", "MG", M], ["Malasia", "MY", M], ["Malaui", "MW", B], ["Maldivas", "MV", M],
  ["Malí", "ML", M], ["Malta", "MT", B], ["Marruecos", "MA", M], ["Mauricio", "MU", B],
  ["Mauritania", "MR", M], ["México", "MX", M], ["Micronesia", "FM", M], ["Moldavia", "MD", M],
  ["Mónaco", "MC", M], ["Mongolia", "MN", B], ["Montenegro", "ME", M], ["Mozambique", "MZ", M],
  ["Namibia", "NA", M], ["Nauru", "NR", M], ["Nepal", "NP", M], ["Nicaragua", "NI", M],
  ["Níger", "NE", M], ["Nigeria", "NG", M], ["Noruega", "NO", B], ["Nueva Zelanda", "NZ", B],
  ["Omán", "OM", B], ["Países Bajos", "NL", B], ["Pakistán", "PK", M], ["Palaos", "PW", M],
  ["Panamá", "PA", M], ["Papúa Nueva Guinea", "PG", M], ["Paraguay", "PY", M], ["Perú", "PE", M],
  ["Polonia", "PL", B], ["Portugal", "PT", B], ["Reino Unido", "GB", B], ["República Centroafricana", "CF", M],
  ["República Checa", "CZ", B], ["República del Congo", "CG", M], ["República Democrática del Congo", "CD", A], ["República Dominicana", "DO", M],
  ["Ruanda", "RW", M], ["Rumanía", "RO", B], ["Rusia", "RU", A], ["Samoa", "WS", M],
  ["San Cristóbal y Nieves", "KN", M], ["San Marino", "SM", B], ["San Vicente y las Granadinas", "VC", M], ["Santa Lucía", "LC", M],
  ["Santo Tomé y Príncipe", "ST", M], ["Senegal", "SN", M], ["Serbia", "RS", M], ["Seychelles", "SC", M],
  ["Sierra Leona", "SL", M], ["Singapur", "SG", B], ["Siria", "SY", A], ["Somalia", "SO", A],
  ["Sri Lanka", "LK", M], ["Suazilandia", "SZ", M], ["Sudáfrica", "ZA", M], ["Sudán", "SD", M],
  ["Sudán del Sur", "SS", A], ["Suecia", "SE", B], ["Suiza", "CH", B], ["Surinam", "SR", M],
  ["Tailandia", "TH", M], ["Taiwán", "TW", B], ["Tanzania", "TZ", M], ["Tayikistán", "TJ", M],
  ["Timor Oriental", "TL", M], ["Togo", "TG", M], ["Tonga", "TO", M], ["Trinidad y Tobago", "TT", M],
  ["Túnez", "TN", M], ["Turkmenistán", "TM", M], ["Turquía", "TR", M], ["Tuvalu", "TV", M],
  ["Ucrania", "UA", M], ["Uganda", "UG", M], ["Uruguay", "UY", B], ["Uzbekistán", "UZ", M],
  ["Vanuatu", "VU", M], ["Venezuela", "VE", A], ["Vietnam", "VN", M], ["Yemen", "YE", A],
  ["Zambia", "ZM", B], ["Zimbabue", "ZW", M], ["Otro", null, M],
];

export const CFG = {
  nombre: "Matriz de Riesgo PLAyFT - Clasificación de Clientes",
  version: "1.0",
  fecha_version: "2026-09-28",
  tipo_cliente: "Persona natural",

  escala: {
    niveles: { Bajo: 0, Medio: 50, Alto: 100 } as Record<Riesgo, number>,
    // Score mínimo (redondeado a entero) de cada clasificación.
    cortes_clasificacion: { Bajo: 0, Medio: 34, Alto: 67 } as Record<Riesgo, number>,
  },

  factores: [
    {
      factor: "Cliente",
      ponderacion: 0.4,
      subfactores: [
        { subfactor: "Persona Políticamente Expuesta (PEP)", ponderacion_interna: 0.36, ponderacion_efectiva: 0.144 },
        { subfactor: "Coincidencias en listas / fuentes abiertas", ponderacion_interna: 0.2, ponderacion_efectiva: 0.08 },
        { subfactor: "Edad", ponderacion_interna: 0.055, ponderacion_efectiva: 0.022 },
        { subfactor: "Estado civil", ponderacion_interna: 0.0275, ponderacion_efectiva: 0.011 },
        { subfactor: "Profesión", ponderacion_interna: 0.0825, ponderacion_efectiva: 0.033 },
        { subfactor: "Ocupación", ponderacion_interna: 0.0825, ponderacion_efectiva: 0.033 },
        { subfactor: "Actividad Economica", ponderacion_interna: 0.0825, ponderacion_efectiva: 0.033 },
        { subfactor: "Perfil de inversionista", ponderacion_interna: 0.11, ponderacion_efectiva: 0.044 },
      ],
    },
    {
      factor: "Producto o Servicio",
      ponderacion: 0.3,
      subfactores: [
        { subfactor: "Tipo de Plan de inversión", ponderacion_interna: 0.15, ponderacion_efectiva: 0.045 },
        { subfactor: "Estado del Plan", ponderacion_interna: 0.1, ponderacion_efectiva: 0.03 },
        { subfactor: "Monto del aporte", ponderacion_interna: 0.3, ponderacion_efectiva: 0.09 },
        { subfactor: "Frecuencia del aporte", ponderacion_interna: 0.2, ponderacion_efectiva: 0.06 },
        { subfactor: "Metodo de Pago", ponderacion_interna: 0.25, ponderacion_efectiva: 0.075 },
      ],
    },
    {
      factor: "Zona Geográfica",
      ponderacion: 0.2,
      subfactores: [
        { subfactor: "Nacionalidad", ponderacion_interna: 0.2, ponderacion_efectiva: 0.04 },
        { subfactor: "País de Nacimiento", ponderacion_interna: 0.1, ponderacion_efectiva: 0.02 },
        { subfactor: "País de domicilio", ponderacion_interna: 0.15, ponderacion_efectiva: 0.03 },
        { subfactor: "País de residencia fiscal", ponderacion_interna: 0.15, ponderacion_efectiva: 0.03 },
        { subfactor: "Origen de recursos", ponderacion_interna: 0.2, ponderacion_efectiva: 0.04 },
        { subfactor: "Destino de recursos", ponderacion_interna: 0.2, ponderacion_efectiva: 0.04 },
      ],
    },
    {
      factor: "Canal de Distribución y Transaccional",
      ponderacion: 0.1,
      subfactores: [
        { subfactor: "Canal de vinculación", ponderacion_interna: 0.75, ponderacion_efectiva: 0.075 },
        { subfactor: "Canal de Operación", ponderacion_interna: 0.25, ponderacion_efectiva: 0.025 },
      ],
    },
  ] as Factor[],

  bandas: {
    edad: [
      { desde: 18, rango: "18-35 años", riesgo: B },
      { desde: 36, rango: "36-55 años", riesgo: M },
      { desde: 56, rango: "56 o más", riesgo: A },
    ] as Banda[],
    monto_aporte_regular_usd_por_pago: [
      { desde: 0, rango: "USD 0.01 – 1,000.00", riesgo: B },
      { desde: 1000.01, rango: "USD 1,000.01 – 3,000.00", riesgo: M },
      { desde: 3000.01, rango: "Más de USD 3,000.00", riesgo: A },
    ] as Banda[],
    monto_aporte_unico_usd: [
      { desde: 0, rango: "USD 0.01 – 25,000.00", riesgo: B },
      { desde: 25000.01, rango: "USD 25,000.01 – 100,000.00", riesgo: M },
      { desde: 100000.01, rango: "Más de USD 100,000.00", riesgo: A },
    ] as Banda[],
  },

  // Orden de prioridad: Declinado → Revisión manual (menor de edad) →
  // Disparo a Alto → Pendiente de datos → Clasificación por score.
  reglas: {
    declinado: {
      paises_iso: ["KP", "MM", "IR"],
      hallazgo: "Coincidencia en Lista de Sanciones",
    },
    disparo_alto: {
      pep: "Sí",
      hallazgos: "Hallazgos Negativos",
      compliance_judgment: "Elevar a Alto",
    },
  },

  // Periodic review: Alto every year, Medio every 2 years, Bajo every 4 years.
  debida_diligencia: [
    { clasificacion: "Bajo", nivel: "Simplificada", revision_meses: 48 },
    { clasificacion: "Medio", nivel: "Estándar", revision_meses: 24 },
    { clasificacion: "Alto", nivel: "Reforzada", revision_meses: 12 },
    { clasificacion: "Declinado", nivel: "No aplica", revision_meses: null },
  ] as DebidaDiligencia[],

  catalogos: {
    "¿Es PEP?": [
      { valor: "Sí", riesgo: A },
      { valor: "Ex PEP", riesgo: M },
      { valor: "No", riesgo: B },
    ],
    "Coincidencias en listas / fuentes abiertas": [
      { valor: "Hallazgos Negativos", riesgo: A },
      { valor: "Hallazgos Relevantes", riesgo: M },
      { valor: "Sin Hallazgos", riesgo: B },
      { valor: "Coincidencia en Lista de Sanciones", riesgo: A },
    ],
    "Estado Civil": [
      { valor: "Soltero", riesgo: B },
      { valor: "Casado", riesgo: M },
      { valor: "Divorciado", riesgo: M },
      { valor: "Viudo", riesgo: B },
    ],
    "Profesión": [
      ...cat(A, [
        "Abogados y notarios públicos",
        "Contadores públicos autorizados",
        "Agentes residentes y fiduciarios",
        "Corredores de bienes raíces",
        "Profesionales del sector financiero (banqueros, asesores de inversión)",
        "Comerciantes de metales y piedras preciosas",
        "Ejecutivos de empresas importadoras/exportadoras",
        "Profesionales del sector petrolero y energético de alto nivel",
        "Directores o apoderados de sociedades offshore",
        "Funcionarios de compras o licitaciones estatales",
      ]),
      ...cat(M, [
        "Ingenieros civiles, industriales, de minas o petróleo",
        "Arquitectos y contratistas de obras",
        "Auditores internos y asesores empresariales",
        "Ejecutivos comerciales y gerentes de ventas",
        "Transportistas y agentes logísticos",
        "Comerciantes mayoristas o minoristas (exportación/importación)",
        "Técnicos en exploración, geología o perforación",
        "Joyeros o artesanos de metales",
        "Profesionales del sector farmacéutico y químico",
      ]),
      ...cat(B, [
        "Docentes, médicos, enfermeros, psicólogos",
        "Técnicos administrativos, secretarias, asistentes contables",
        "Obreros, mecánicos, operadores de maquinaria",
        "Agricultores, pescadores, artesanos",
        "Personal de mantenimiento y servicios generales",
        "Funcionarios públicos de bajo rango",
        "Profesionales del área ambiental y seguridad ocupacional",
      ]),
      { valor: "Otro", riesgo: M },
    ],
    "Ocupación": [
      ...cat(A, [
        "Dueños o administradores de casas de empeño",
        "Cambistas o prestamistas informales",
        "Comerciantes de joyas, oro, plata o piedras preciosas",
        "Comerciantes de vehículos nuevos o usados (autos, motos, barcos)",
        "Empresarios de casas de apuestas o casinos",
        "Agentes de importación/exportación",
        "Gerentes o administradores de empresas offshore",
        "Intermediarios financieros no regulados",
        "Contratistas o proveedores del Estado con operaciones internacionales",
      ]),
      ...cat(M, [
        "Comerciantes al por mayor y menor (ropa, alimentos, materiales de construcción, etc.)",
        "Transportistas y operadores logísticos",
        "Propietarios de talleres o servicios técnicos",
        "Agentes de viajes y turismo",
        "Supervisores o capataces de obra/mina",
        "Técnicos en mantenimiento industrial o mecánico",
        "Encargados de almacenes o bodegas",
        "Gerentes de sucursales o puntos de venta",
        "Promotores inmobiliarios",
      ]),
      ...cat(B, [
        "Obreros, operarios y personal de planta",
        "Conductores, mensajeros y repartidores",
        "Recepcionistas y auxiliares administrativos",
        "Guardias de seguridad y personal de mantenimiento",
        "Cajeros y dependientes de tienda",
        "Agricultores, pescadores y artesanos",
        "Trabajadores domésticos y de servicios personales",
        "Auxiliares de limpieza, conserjes y jardineros",
      ]),
      { valor: "Otro", riesgo: M },
    ],
    "Actividad Económica": [
      ...cat(B, [
        "Empresas privadas de servicios administrativos",
        "Empresas privadas de consultoría empresarial",
        "Empresas de recursos humanos",
        "Tiendas de ropa al por menor",
        "Zapaterías",
        "Librerías",
        "Papelerías",
        "Farmacias (venta minorista regulada)",
        "Clínicas veterinarias",
        "Centros educativos privados",
        "Servicios de diseño gráfico y marketing digital",
        "Empresas de tecnología y software",
        "Gimnasios y centros deportivos",
      ]),
      ...cat(M, [
        "Empresas de logística y mensajería",
        "Almacenes y centros de distribución",
        "Empresas de transporte de carga liviana",
        "Restaurantes y cafeterías",
        "Bares y discotecas",
        "Hoteles y hostales",
        "Empresas de cobros y recuperación de cartera",
        "Clínicas médicas privadas",
        "Laboratorios clínicos",
        "Importadoras de mercancía",
        "Exportadoras de mercancía",
        "Empresas de construcción liviana",
        "Agencias de viajes",
        "Arrendadoras de vehículos",
      ]),
      ...cat(A, [
        "Inmobiliarias y promotoras de bienes raíces",
        "Compra y venta de vehículos nuevos y usados",
        "Casas de empeño",
        "Casinos y salas de juego",
        "Loterías privadas",
        "Empresas de remesas y transferencias de dinero",
        "Empresas de cambio de divisas",
        "Abogados que administran fondos de clientes",
        "Contadores que manejan fondos de clientes",
        "Comercio de metales preciosos",
        "Comercio de piedras preciosas y joyerías",
        "Empresas con operaciones offshore",
        "Empresas intensivas en manejo de efectivo",
      ]),
      { valor: "Otro", riesgo: M },
    ],
    "Perfil de Inversionista": [
      { valor: "Mayoría A - Cauteloso", riesgo: B },
      { valor: "Mayoría B - Balanceado", riesgo: M },
      { valor: "Mayoría C - Crecimiento", riesgo: M },
      { valor: "Mayoría D - Agresivo", riesgo: A },
    ],
    "Tipo de Plan": [
      { valor: "Aporte Regular", riesgo: B },
      { valor: "Aporte Único", riesgo: M },
    ],
    "Estado del Plan": [
      { valor: "Activo", riesgo: M },
      { valor: "Paid Up", riesgo: B },
      { valor: "Matured", riesgo: B },
      { valor: "Premium Holiday", riesgo: M },
    ],
    "Frecuencia del Aporte": [
      { valor: "Mensual", riesgo: B },
      { valor: "Trimestral", riesgo: B },
      { valor: "Semestral", riesgo: M },
      { valor: "Anual", riesgo: M },
      { valor: "Aporte Único", riesgo: A },
    ],
    "Método de Pago": [
      { valor: "Tarjeta de Credito", riesgo: M },
      { valor: "Tarjeta de Credito de Tercero Autorizado", riesgo: A },
      { valor: "Transferencia Bancaria", riesgo: B },
    ],
    "Canal de Vinculación": [
      { valor: "Digital", riesgo: A },
      { valor: "Agente Referente", riesgo: M },
      { valor: "Oficinas", riesgo: B },
    ],
    "Canal de Operación": [
      { valor: "Transaccion Directa del cliente", riesgo: A },
      { valor: "Agente Referente", riesgo: B },
    ],
  } as Record<string, CatalogItem[]>,

  listas_auxiliares: {
    tipo_evaluacion: ["Onboarding", "Revisión Periódica"],
    compliance_judgment: ["Sin observación", "Elevar a Alto"],
  },

  paises: PAISES.map(([pais, iso2, riesgo]): Pais => ({ pais, iso2, riesgo })),

  tipos_de_cambio_usd: [
    { moneda: "USD", usd_por_unidad: 1.0, fecha: "2026-09-28", fuente: "Moneda base" },
    { moneda: "GBP", usd_por_unidad: 1.3262, fecha: "2026-09-28", fuente: "Trading Economics, GBP/USD 28-Sep-2026" },
    { moneda: "EUR", usd_por_unidad: 1.1478, fecha: "2026-09-21", fuente: "Pound Sterling Live, USD/EUR medio 0.8712 (21-Sep-2026), invertido" },
    { moneda: "AED", usd_por_unidad: 0.2723, fecha: "2026-09-28", fuente: "Paridad fija AED 3.6725 por USD, invertida" },
    { moneda: "SGD", usd_por_unidad: 0.7886, fecha: "2026-09-10", fuente: "ValutaFX, SGD/USD 10-Sep-2026" },
  ] as TipoDeCambio[],
};
