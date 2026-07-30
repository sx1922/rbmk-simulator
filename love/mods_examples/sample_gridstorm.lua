return {
  name = '示例：电网风暴',
  events = {
    {
      icon = '🌩️',
      title = '电网风暴预警',
      desc = '气象中心报告雷电风暴正在逼近核电站区域。可能造成外电源波动。',
      choices = {
        {label = '预防性降功率', cost = nil, risk = nil,
         fx = function(G) G.r:moveRods(-15); G:log('info','已预防性降功率。') end},
        {label = '检查柴油机备用', cost = 10000, risk = nil,
         fx = function(G) G.money = G.money - 10000; G:log('good','柴油机备妥。') end},
        {label = '忽略', cost = nil, risk = 0.25,
         fx = function(G) if G.rng:next() < 0.25 then G.r.power = G.r.power * 0.7; G:log('danger','💥 雷击跳闸！功率骤降！') else G:log('info','风暴绕行。') end end},
      },
    },
  },
}
