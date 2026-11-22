import numpy as np, math, json, sys
def run(decks):
    cnt=[16*decks]+[4*decks]*9
    N=52*decks
    # outcome vector per leaf -> accumulate weighted moments of bet results
    names=["banker_5pct","banker_EZ_D7push","banker_super6_half","player","tie_8to1","tie_9to1",
           "dragon7_40","panda8_25","dragonbonus_player","dragonbonus_banker","lucky6_12_20"]
    k=len(names); S1=np.zeros(k); S2=np.zeros((k,k)); W=0.0
    ev={}  # also count events
    ev_counts={}
    def add_event(name,w): ev_counts[name]=ev_counts.get(name,0)+w
    def dbonus(win_side_total, lose_total, natural, tie):
        pass
    c=cnt[:]
    def draw(v,n):
        w=c[v]/n; c[v]-=1; return w
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
                    P=(p1+p2)%10; B=(b1+b2)%10
                    leaves=[]
                    if P>=8 or B>=8:
                        leaves.append((w4,P,B,2,2,True))
                    else:
                        n=N-4
                        if P<=5:
                            for p3 in range(10):
                                if c[p3]==0: continue
                                w5=w4*c[p3]/n; c[p3]-=1
                                Pf=(P+p3)%10
                                bd = (B<=2) or (B==3 and p3!=8) or (B==4 and 2<=p3<=7) or (B==5 and 4<=p3<=7) or (B==6 and p3 in (6,7))
                                if bd:
                                    for b3 in range(10):
                                        if c[b3]==0: continue
                                        leaves.append((w5*c[b3]/(n-1),Pf,(B+b3)%10,3,3,False))
                                else:
                                    leaves.append((w5,Pf,B,3,2,False))
                                c[p3]+=1
                        else:
                            if B<=5:
                                for b3 in range(10):
                                    if c[b3]==0: continue
                                    leaves.append((w4*c[b3]/n,P,(B+b3)%10,2,3,False))
                            else:
                                leaves.append((w4,P,B,2,2,False))
                    for (w,Pf,Bf,np_,nb,nat) in leaves:
                        bw=Bf>Pf; pw=Pf>Bf; tie=Pf==Bf
                        r=np.zeros(k)
                        r[0]=0.95 if bw else (-1 if pw else 0)
                        r[1]=(0 if nb==3 and Bf==7 else 1) if bw else (-1 if pw else 0)
                        r[2]=(0.5 if Bf==6 else 1) if bw else (-1 if pw else 0)
                        r[3]=1 if pw else (-1 if bw else 0)
                        r[4]=8 if tie else -1
                        r[5]=9 if tie else -1
                        r[6]=40 if (bw and nb==3 and Bf==7) else -1
                        r[7]=25 if (pw and np_==3 and Pf==8) else -1
                        def db(win,margin):
                            if nat and tie: return 0
                            if not win: return -1
                            if nat: return 1
                            return {9:30,8:10,7:6,6:4,5:2,4:1}.get(margin,-1)
                        r[8]=db(pw,Pf-Bf)
                        r[9]=db(bw,Bf-Pf)
                        r[10]=(12 if nb==2 else 20) if (bw and Bf==6) else -1
                        S1+=w*r; S2+=w*np.outer(r,r); W+=w
                        if bw: add_event("banker_win",w)
                        if pw: add_event("player_win",w)
                        if tie: add_event("tie",w)
                        if bw and nb==3 and Bf==7: add_event("banker_3card7_win",w)
                        if pw and np_==3 and Pf==8: add_event("player_3card8_win",w)
                        if bw and Bf==6: add_event("banker_win_on_6",w)
                    c[b2]+=1
                c[p2]+=1
            c[b1]+=1
        c[p1]+=1
    mean=S1/W; cov=S2/W-np.outer(mean,mean)
    return names,W,mean,cov,{k2:v/W for k2,v in ev_counts.items()}
out={}
for d in (8,6):
    names,W,mean,cov,evs=run(d)
    print(f"=== {d} decks  total weight {W:.12f}")
    for i,n in enumerate(names): print(f"{n:24s} EV {mean[i]:+.6f}  HE {-mean[i]*100:7.4f}%  SD {math.sqrt(cov[i,i]):.4f}")
    print({k:round(v,8) for k,v in evs.items()})
    sd=np.sqrt(np.diag(cov)); corr=cov/np.outer(sd,sd)
    print("corr banker_EZ vs player", round(corr[1,3],4), " banker_5pct vs player",round(corr[0,3],4))
    out[d]=dict(names=names,mean=mean.tolist(),cov=cov.tolist(),events=evs)
# pair bets analytic
for d in (8,6):
    N=52*d; per=4*d
    ppair=13*per*(per-1)/(N*(N-1))
    psuited=13*4*d*(d-1)/(N*(N-1))
    print(d,"decks: P(pair)",ppair,"pair 11:1 HE",-(12*ppair-1)*100,"SD",math.sqrt(ppair*121+(1-ppair)*1-(12*ppair-1)**2))
json.dump(out,open("bac_out.json","w"),indent=1)
