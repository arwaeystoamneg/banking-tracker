import json, math
# re-use 3CP analysis by exec, capture numbers
ns={}; exec(open('tcp_analyze.py').read().replace('print(','(lambda *a,**k:None)('), ns)
bac=json.load(open('bac_out.json'))
ref={"three_card_poker":{"ante_play":ns['res'],"raise_freq":ns['raise_freq'],
      "between_seat_corr_ante_play_approx":0.2019,
      "pair_plus":{k:{"house_edge":-v[0],"sd":v[1]} for k,v in ns['pp'].items()},
      "hand_counts_of_22100":ns['hc']},
     "baccarat":{}}
for d,v in bac.items():
    ref["baccarat"][f"{d}_decks"]={n:{"ev":m,"house_edge":-m,"sd":math.sqrt(v['cov'][i][i])} for i,(n,m) in enumerate(zip(v['names'],v['mean']))}
    ref["baccarat"][f"{d}_decks"]["_events"]=v['events']
    ref["baccarat"][f"{d}_decks"]["_cov_matrix"]={"order":v['names'],"cov":v['cov']}
# perfect pairs 25/12/6 (no jokers)
pp={}
for d in (6,8):
    N=52*d; pf=(d-1)/(N-1); col=d/(N-1); mix=2*d/(N-1); lose=1-pf-col-mix
    ev=25*pf+12*col+6*mix-lose; sd=math.sqrt(625*pf+144*col+36*mix+lose-ev*ev)
    pp[f"{d}_decks"]={"house_edge":-ev,"sd":sd}
ref["blackjack_side_bets"]={"perfect_pairs_25_12_6":pp}
json.dump(ref,open('reference_values.json','w'),indent=1)
print(json.dumps(pp,indent=1))
