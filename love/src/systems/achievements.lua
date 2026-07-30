local A = {}

A.ACHIEVEMENTS = {
  {id='first_crit',icon='[电]',name='首次临界',desc='成功启动反应堆',
   check=function(G) return G.totalCrits>=1 end},
  {id='full_power',icon='[火]',name='满功率运行',desc='达到100%额定功率',
   check=function(G) return G.maxPowerPct>=100 end},
  {id='safe30',icon='[盾]',name='安全月',desc='安全运行30天无事故',
   check=function(G) return G.daysOp>=30 and G.scrams==0 end},
  {id='xenon_master',icon='[毒]',name='氙毒大师',desc='在氙毒峰值时稳定运行',
   check=function(G) return G.survivedXenonPeak end},
  {id='money_maker',icon='[钱]',name='计划经济模范',desc='累计发电超过500万MWh',
   check=function(G) return G.totalGen>=5000000 end},
  {id='az5_survivor',icon='[AZ]',name='AZ-5幸存者',desc='触发AZ-5后反应堆安全停堆',
   check=function(G) return G.az5Survived end},
  {id='full_staff',icon='[群]',name='满编班组',desc='拥有20名操作员',
   check=function(G) local n=0; for _,s in ipairs(G.staff) do if s.alive then n=n+1 end end; return n>=20 end},
  {id='no_event',icon='[鸽]',name='风平浪静',desc='连续10天无事件',
   check=function(G) return G.daysSinceEvent>=10 end},
  {id='high_trust',icon='[星]',name='部长信任',desc='政治信任达到100',
   check=function(G) return G.politics>=100 end},
  {id='overclock',icon='[亡]',name='玩火者',desc='功率超过110%后安全降回',
   check=function(G) return G.survivedOverpower end},
  {id='winter_warrior',icon='[雪]',name='冬季战士',desc='在冬季完成月度计划',
   check=function(G) return G.winterQuotaDone end},
  {id='veteran',icon='[勋]',name='老站长',desc='运营超过100天',
   check=function(G) return G.daysOp>=100 end},
}

return A
