import math, json
cnt = {0:[132652800,53876136,38134212,234696,77992716],
1:[0,20926080,36168624,11232,11873520],2:[0,6135276,12793544,3288,1260596],
3:[0,4001004,8975484,18288,270504],4:[0,288960,665776,0,3312],5:[0,266196,617044,144,968]}
T=407170400
assert sum(sum(v) for v in cnt.values())==T
def stats(dist):
    n=sum(p for _,p in dist); m=sum(x*p for x,p in dist)/n; v=sum(x*x*p for x,p in dist)/n-m*m
    return m,math.sqrt(v)
res={}
# ante bonus tables (SF, trips, straight)
for name,ab,pwt in [("AB 5-4-1",(5,4,1),False),("AB 4-3-1",(4,3,1),False),("AB 3-2-1",(3,2,1),False),
                    ("AB 5-3-1",(5,3,1),False),("AB 5-4-1 + player wins ties",(5,4,1),True),("No ante bonus",(0,0,0),False)]:
    abv={5:ab[0],4:ab[1],3:ab[2],2:0,1:0,0:0}
    dist=[]
    for c,row in cnt.items():
        for r,k in enumerate(row):
            if k==0: continue
            if r==0: x=-1
            else:
                base={1:1,2:2,3:(2 if pwt else 0),4:-2}[r]; x=base+abv[c]
            dist.append((x,k))
    m,s=stats(dist)
    avgbet = 1+ sum(sum(row[1:]) for row in cnt.values())/T
    res[name]=dict(ev_per_ante=m, sd_per_ante=s, element_of_risk=m/avgbet, avg_total_bet=avgbet)
raise_freq = sum(sum(row[1:]) for row in cnt.values())/T
# outcome frequencies
fold=sum(row[0] for row in cnt.values())/T
dnq=sum(row[1] for row in cnt.values())/T
win=sum(row[2] for row in cnt.values())/T; tie=sum(row[3] for row in cnt.values())/T; loss=sum(row[4] for row in cnt.values())/T
print("raise freq",raise_freq,"fold",fold,"dnq",dnq,"win",win,"tie",tie,"loss",loss)
for k,v in res.items(): print(k, {a:round(b,6) for a,b in v.items()})
# between-seat covariance (approx, ignores card removal between the two player hands)
cov=0.54241113
var=res["AB 5-4-1"]["sd_per_ante"]**2
print("between-seat cov",cov,"corr",cov/var)
# hand probabilities
hc={'sf':48,'trips':52,'straight':720,'flush':1096,'pair':3744,'high':16440}; N=22100
miniroyal=4
pp={}
for name,t in [("40-30-6-4-1",(40,30,6,4,1)),("40-30-6-3-1",(40,30,6,3,1)),("40-30-5-4-1",(40,30,5,4,1)),
               ("40-25-6-4-1",(40,25,6,4,1)),("40-30-5-3-1",(40,30,5,3,1)),("50-40-6-3-1",(50,40,6,3,1)),("35-25-6-4-1",(35,25,6,4,1))]:
    dist=[(t[0],48),(t[1],52),(t[2],720),(t[3],1096),(t[4],3744),(-1,16440)]
    m,s=stats(dist); pp[name]=(m,s); print("PairPlus",name,round(-m*100,3),"% HE  SD",round(s,4))
# CA Grand 'Bonus Bet': mini royal 200, SF 40, trips 30, str 6, flush 3, pair 1
dist=[(200,4),(40,44),(30,52),(6,720),(3,1096),(1,3744),(-1,16440)]
m,s=stats(dist); print("CA Grand Bonus (200/40/30/6/3/1) HE",round(-m*100,3),"SD",round(s,4))
# 6 card bonus
six=dict(none=18876456,trips=732160,straight=361620,flush=205792,fh=165984,quads=14664,sf=1656,royal=188)
assert sum(six.values())==math.comb(52,6), sum(six.values())
tabs={"PT1 1000/200/100/20/15/10/7":(1000,200,100,20,15,10,7),"PT2 2000/200/50/25/15/10/5":(2000,200,50,25,15,10,5),
      "PT3 1000/200/50/25/15/10/5":(1000,200,50,25,15,10,5),"PT4 1000/200/50/25/20/10/5":(1000,200,50,25,20,10,5)}
for n,t in tabs.items():
    dist=[(t[0],six['royal']),(t[1],six['sf']),(t[2],six['quads']),(t[3],six['fh']),(t[4],six['flush']),(t[5],six['straight']),(t[6],six['trips']),(-1,six['none'])]
    m,s=stats(dist); print("6CB",n,"HE",round(-m*100,3),"SD",round(s,4))
print({k:v/math.comb(52,6) for k,v in six.items()})
