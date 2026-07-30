local RNG = {}
RNG.__index = RNG

function RNG.new(seed)
  local self = setmetatable({}, RNG)
  self.s = seed % 4294967296
  if self.s == 0 then self.s = 1 end
  return self
end

function RNG:next()
  self.s = (self.s * 1664525 + 1013904223) % 4294967296
  return self.s / 4294967296
end

function RNG:range(a, b)
  return a + self:next() * (b - a)
end

function RNG:int(a, b)
  return math.floor(self:range(a, b + 1))
end

return RNG
