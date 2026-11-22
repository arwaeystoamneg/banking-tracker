"""Exact baccarat (value-level recursion with card removal) for every bet the MC engine supports.
Names match cardsim.baccarat.BETS. Pair bets computed analytically (rank level)."""
import math, json, sys
import numpy as np

def run(decks):
    cnt=[16*decks]+[4*decks]*9; N=52*decks
    names=["banker_5pct","banker_ez","banker_super6","player","tie_8","tie_9","dragon7","panda8",
           "dragon_bonus_player","dragon_bonus_banker","lucky6","supreme7_mb01","supreme7_mb02",
           "supreme7_mb03","divine9","eclipse"]
    k=len(names); S1=np.zeros(k); S2=np.zeros(k); W=0.0; ev={}
    c=cnt
    def db(win,margin,nat,tie):
        if nat and tie: return 0.0
        if not win: return -1.0
        if nat: return 1.0
        return {9:30,8:10,7:6,6:4,5:2,4:1}.get(margin,-1.0)
    def leaf(w,P,B,np_,nb,nat):
        nonlocal W,S1,S2
        bw=B>P; pw=P>B; tie=P==B
        sun7=bw and nb==3 and B==7; moon8=pw and np_==3 and P==8
        s3=P==7 and B==7 and np_==3 and nb==3; s2=P==7 and B==7 and np_==2 and nb==2
        d9p=np_==3 and P==9; d9b=nb==3 and B==9
        r=np.array([0.95 if bw else (-1 if pw else 0),
           (0 if sun7 else 1) if bw else (-1 if pw else 0),
           (0.5 if B==6 else 1) if bw else (-1 if pw else 0),
           1 if pw else (-1 if bw else 0), 8 if tie else -1, 9 if tie else -1,
           40 if sun7 else -1, 25 if moon8 else -1, db(pw,P-B,nat,tie), db(bw,B-P,nat,tie),
           (12 if nb==2 else 20) if (bw and B==6) else -1,
           200 if s3 else (50 if s2 else -1), 400 if s3 else -1, 100 if s2 else -1,
           75 if (d9p and d9b) else (10 if (d9p or d9b) else -1),
           6 if (sun7 or moon8 or s3 or s2 or d9p or d9b) else -1],dtype=float)
        S1+=w*r; S2+=w*r*r; W+=w
        for nm,cond in (("both_3card_7",s3),("both_2card_7",s2),("divine9_both",d9p and d9b),
                        ("divine9_one",(d9p or d9b) and not (d9p and d9b)),("eclipse_any",r[15]>0)):
            if cond: ev[nm]=ev.get(nm,0)+w
    for p1 in range(10):
        w1=c[p1]/N; c[p1]-=1
        for b1 in range(10):
            if c[b1]==0: continue
            w2=w1*c[b1]/(N-1); c[b1]-=1
            for p2 in range(10):
                if c[p2]==0: continue
                w3=w2*c[p2]/(N-2); c[p2]-=1
                for b2 in range(10):
                    if c[b2]==0: continue
                    w4=w3*c[b2]/(N-3); c[b2]-=1
                    P=(p1+p2)%10; B=(b1+b2)%10; n=N-4
                    if P>=8 or B>=8: leaf(w4,P,B,2,2,True)
                    elif P<=5:
                        for p3 in range(10):
                            if c[p3]==0: continue
                            w5=w4*c[p3]/n; c[p3]-=1; Pf=(P+p3)%10
                            if (B<=2) or (B==3 and p3!=8) or (B==4 and 2<=p3<=7) or (B==5 and 4<=p3<=7) or (B==6 and p3 in (6,7)):
                                for b3 in range(10):
                                    if c[b3]==0: continue
                                    leaf(w5*c[b3]/(n-1),Pf,(B+b3)%10,3,3,False)
                            else: leaf(w5,Pf,B,3,2,False)
                            c[p3]+=1
                    elif B<=5:
                        for b3 in range(10):
                            if c[b3]==0: continue
                            leaf(w4*c[b3]/n,P,(B+b3)%10,2,3,False)
                    else: leaf(w4,P,B,2,2,False)
                    c[b2]+=1
                c[p2]+=1
            c[b1]+=1
        c[p1]+=1
    out={}
    for i,nm in enumerate(names):
        m=S1[i]/W; out[nm]={"ev":m,"house_edge":-m,"sd":math.sqrt(S2[i]/W-m*m)}
    per=4*decks; pp=13*per*(per-1)/(N*(N-1)); m=12*pp-1
    for nm in ("player_pair","banker_pair"):
        out[nm]={"ev":m,"house_edge":-m,"sd":math.sqrt(121*pp+(1-pp)-m*m)}
    out["_events"]={k2:v/W for k2,v in ev.items()}
    return out

if __name__=="__main__":
    res={f"{d}_decks":run(d) for d in (8,6)}
    json.dump(res,open(sys.argv[1] if len(sys.argv)>1 else "bac_exact_out.json","w"),indent=1)
    for d,v in res.items():
        print("==",d)
        for k2,x in v.items():
            if k2.startswith("_"): print(k2,x); continue
            print(f"  {k2:22s} HE {x['house_edge']*100:8.4f}%  SD {x['sd']:.4f}")
