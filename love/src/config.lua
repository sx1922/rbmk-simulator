local C = {
  RATED_T = 3200,
  RATED_E = 1000,
  EFF = 0.3125,
  BETA = 0.0035,
  NUM_RODS = 211,
  MELT_T = 3840,
  ORM_MIN = 26,
  ORM_CRIT = 15,
  LOW_PCT = 20,
  SAT_T = 285.8,
  FLOW_RATED = 48000,
  FLOW_PER_PUMP = 6000,
  QUOTA = 720000,
}
C.SEASONS = {'冬','冬','春','春','春','夏','夏','夏','秋','秋','秋','冬'}
C.DIFFS = {
  {name='学员',money=8000000,eventMul=0.6,politicsDecay=2,ormHint=true},
  {name='工程师',money=5000000,eventMul=1.0,politicsDecay=5,ormHint=true},
  {name='站长',money=3000000,eventMul=1.5,politicsDecay=8,ormHint=false},
}
return C
