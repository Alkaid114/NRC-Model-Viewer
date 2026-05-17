export const TYPE_COLORS = {
  Cup: '#3a2645', Ps: '#25334a', Hr: '#4a3025', Hr_Ht: '#4a3025',
  Br: '#304530',  Et: '#40302a', Es: '#255040', Fe: '#352045',
  Ge: '#402a2a',  So: '#253040', Se: '#352530', Hi: '#402035',
  Bg: '#253535',  Bi: '#352535', Mw: '#252a45', Ms: '#305035',
  Mp: '#40251a',  By: '#303825', Fi: '#352040', Er: '#303040',
  Hg: '#303030',  Hp: '#303030', Ht: '#352030',
  Sk: '#4a3020',  Pu: '#252840', Dc: '#302040',
}

export const SUB_TAB_FILTERS = {
  '4':  i => i.type === 'Cup' && i.isSuit,
  '5':  i => i.type === 'Cup' && !i.isSuit,
  '6':  i => i.type === 'Ps',
  '7':  i => ['Hi', 'Ht'].includes(i.type),
  '8':  i => i.type === 'Ge',
  '10': i => ['Fi', 'Ms'].includes(i.type),
  '11': i => i.type === 'Se',
  '12': i => i.type === 'So',
  '13': i => i.type === 'Bg',
  '14': i => i.type === 'Bi',
  '17': i => i.type === 'Sk',
  '18': i => i.type === 'Br',
  '19': i => i.type === 'Et',
  '20': i => i.type === 'Pu',
  '21': i => i.type === 'Dc',
}

export const L1_TAB_FILTERS = {
  '2':  i => i.type === 'Mw',
  '15': i => ['Hr', 'Hr_Ht'].includes(i.type),
}

export const TYPE_TO_SLOT = {
  Hr: 'hr', Hr_Ht: 'hr',
  Br: 'br',
  Et: 'et',
  Es: 'es', Fe: 'fe',
  Fi: 'fi', Ms: 'fi',
  Cup: 'cup', Ps: 'ps',
  So: 'so',  Se: 'se',
  Ht: 'ht',  Hi: 'hi',
  Mp: 'mp',  Ge: 'ge',
  Bg: 'bg',  Bi: 'bi',
  Mw: 'mw',
  Sk: 'sk',
  Pu: 'pu',
  Dc: 'dc',
  Er: 'er',
}

export const REQUIRED_SLOTS = new Set(['sk', 'br', 'cup', 'er', 'es', 'et', 'fe', 'ge', 'hr', 'ps', 'pu', 'so'])

export const MATERIAL_FOLDERS = new Set([
  'Bg', 'Bi', 'Br', 'By', 'Cup', 'Er', 'Es', 'Et', 'Fe', 'Fi',
  'Ge', 'Hi', 'Hr', 'Ht', 'Mp', 'Ms', 'Mw', 'Ps', 'Se', 'So',
])

export const DEFAULT_MODEL_BASES = {
  PC1: {
    sk:  '30000001',
    br:  'SKM_PC1_Br_10300001',
    cup: 'SKM_PC1_Cup_10700001',
    er:  'SKM_PC1_Er_10600001',
    es:  'SKM_PC1_Es_10500001',
    et:  'SKM_PC1_Et_10400001',
    fe:  'SKM_PC1_Fe_10200001',
    ge:  'SKM_PC1_Ge_10800001',
    hr:  'SKM_PC1_Hr_10100001',
    ps:  'SKM_PC1_Ps_10900001',
    pu:  '34000001',
    so:  'SKM_PC1_So_11000001',
  },
  PC2: {
    sk:  '30000001',
    br:  'SKM_PC2_Br_20300001',
    cup: 'SKM_PC2_Cup_20700001',
    er:  'SKM_PC2_Er_20600001',
    es:  'SKM_PC2_Es_20500001',
    et:  'SKM_PC2_Et_20400001',
    fe:  'SKM_PC2_Fe_20200001',
    ge:  'SKM_PC2_Ge_20800001',
    hr:  'SKM_PC2_Hr_20100001',
    ps:  'SKM_PC2_Ps_20900001',
    pu:  '34000001',
    so:  'SKM_PC2_So_21000001',
  },
}
