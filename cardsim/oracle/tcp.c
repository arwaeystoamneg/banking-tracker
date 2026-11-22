// Exact Three Card Poker analysis: ante/play (Q-6-4 strategy), ante bonus tables,
// pair plus tables, per-dealer-hand conditional means (for between-seat covariance),
// and 6-card bonus by full enumeration of C(52,6).
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

static int RANK(int c){return c%13;}  // 0=2 ... 12=A
static int SUIT(int c){return c/13;}

// category: 5 SF, 4 trips, 3 straight, 2 flush, 1 pair, 0 high
// also returns 1 if mini royal (AKQ suited)
static int score3(int a,int b,int c,int *cat,int *miniroyal){
  int r[3]={RANK(a),RANK(b),RANK(c)};
  // sort desc
  for(int i=0;i<3;i++)for(int j=i+1;j<3;j++)if(r[j]>r[i]){int t=r[i];r[i]=r[j];r[j]=t;}
  int fl = SUIT(a)==SUIT(b)&&SUIT(b)==SUIT(c);
  int st=0, hi=r[0];
  if(r[0]==r[1]+1&&r[1]==r[2]+1){st=1;hi=r[0];}
  if(r[0]==12&&r[1]==1&&r[2]==0){st=1;hi=1;} // A-2-3 low straight, high card 3
  int k;
  *miniroyal = fl && r[0]==12&&r[1]==11&&r[2]==10;
  if(st&&fl){k=5; *cat=k; return k*2197*13 + hi;}
  if(r[0]==r[2]){k=4;*cat=k;return k*2197*13+r[0];}
  if(st){k=3;*cat=k;return k*2197*13+hi;}
  if(fl){k=2;*cat=k;return k*2197*13+r[0]*169+r[1]*13+r[2];}
  if(r[0]==r[1]||r[1]==r[2]){
    int p = r[1]; int kick = (r[0]==r[1])? r[2]: r[0];
    k=1;*cat=k;return k*2197*13+p*13+kick;}
  k=0;*cat=k;return r[0]*169+r[1]*13+r[2];
}
static int raise_q64(int a,int b,int c,int cat){
  if(cat>0) return 1;
  int r[3]={RANK(a),RANK(b),RANK(c)};
  for(int i=0;i<3;i++)for(int j=i+1;j<3;j++)if(r[j]>r[i]){int t=r[i];r[i]=r[j];r[j]=t;}
  if(r[0]>10) return 1;       // K or A high
  if(r[0]<10) return 0;
  if(r[1]>4) return 1;        // Q-7+
  if(r[1]<4) return 0;
  return r[2]>=2;             // Q-6-4+
}
static int qualifies(int s,int cat){ if(cat>0) return 1; return (s/169)>=10; }

int main(){
  // enumerate 3-card hands
  int nh=0; static int H[22100][3]; static int S[22100],C[22100],MR[22100];
  for(int a=0;a<52;a++)for(int b=a+1;b<52;b++)for(int c=b+1;c<52;c++){
    H[nh][0]=a;H[nh][1]=b;H[nh][2]=c; S[nh]=score3(a,b,c,&C[nh],&MR[nh]); nh++; }
  // pair plus / bonus distribution
  long catcnt[6]={0}; long mr=0;
  for(int i=0;i<nh;i++){catcnt[C[i]]++; mr+=MR[i];}
  printf("CATCOUNTS high=%ld pair=%ld flush=%ld straight=%ld trips=%ld sf=%ld miniroyal=%ld\n",
    catcnt[0],catcnt[1],catcnt[2],catcnt[3],catcnt[4],catcnt[5],mr);

  // ante/play: outcome classes (player cat x result) to allow any ante bonus table later
  // result: 0 fold, 1 dealer no qualify, 2 win, 3 tie, 4 loss
  static double cnt[6][5]; memset(cnt,0,sizeof cnt);
  static double cntPWT[6][5]; // not needed separately; ties handled by flag
  double total=0;
  // per-dealer conditional mean of base (ante+play, ante bonus T1) outcome
  double sum_m2=0, sum_m=0; double nd=0;
  static int used[52];
  for(int d=0; d<nh; d++){
    memset(used,0,sizeof used); used[H[d][0]]=used[H[d][1]]=used[H[d][2]]=1;
    int dq = qualifies(S[d],C[d]);
    double s=0, n=0;
    for(int p=0;p<nh;p++){
      if(used[H[p][0]]||used[H[p][1]]||used[H[p][2]]) continue;
      int cat=C[p]; int res;
      if(!raise_q64(H[p][0],H[p][1],H[p][2],cat)) res=0;
      else if(!dq) res=1;
      else if(S[p]>S[d]) res=2; else if(S[p]==S[d]) res=3; else res=4;
      cnt[cat][res]+=1; n+=1;
      double base = (res==0)?-1:(res==1)?1:(res==2)?2:(res==3)?0:-2;
      double ab = (res==0)?0:(cat==5?5:cat==4?4:cat==3?1:0);
      s += base+ab;
    }
    double m=s/n; sum_m+=m; sum_m2+=m*m; nd+=1; total+=n;
  }
  printf("TOTAL %.0f\n", total);
  for(int c=0;c<6;c++){printf("CAT %d:",c); for(int r=0;r<5;r++) printf(" %.0f",cnt[c][r]); printf("\n");}
  double Em=sum_m/nd, Vm=sum_m2/nd-Em*Em;
  printf("DEALER_COND mean=%.8f var_of_cond_mean(cov between seats)=%.8f\n",Em,Vm);

  // 6-card bonus: categories 0 none,1 trips,2 straight,3 flush,4 FH,5 quads,6 SF,7 royal
  long six[8]={0};
  int c6[6];
  for(c6[0]=0;c6[0]<52;c6[0]++)for(c6[1]=c6[0]+1;c6[1]<52;c6[1]++)for(c6[2]=c6[1]+1;c6[2]<52;c6[2]++)
  for(c6[3]=c6[2]+1;c6[3]<52;c6[3]++)for(c6[4]=c6[3]+1;c6[4]<52;c6[4]++)for(c6[5]=c6[4]+1;c6[5]<52;c6[5]++){
    int rc[13]={0}, sc[4]={0}; int sr[4]={0}; // suit rank bitmask
    for(int i=0;i<6;i++){int r=RANK(c6[i]),s=SUIT(c6[i]); rc[r]++; sc[s]++; sr[s]|=1<<r;}
    int best=0;
    // straight flush / royal
    for(int s=0;s<4;s++) if(sc[s]>=5){
      int m=sr[s]; int mm = m | ((m>>12)&1? 0:0);
      int ext = (m<<1) | ((m>>12)&1); // bit0 = ace-low
      for(int top=12; top>=3; top--){ // top rank index of straight (in ext bits: top+1)
        int need = 0x1F << (top+1-4);
        if((ext & need)==need){ int cat = (top==12)?7:6; if(cat>best)best=cat; break; }
      }
      if(best<3) best=3; // flush
      (void)mm;
    }
    int q=0,t=0,p=0;
    for(int r=0;r<13;r++){ if(rc[r]==4)q++; else if(rc[r]==3)t++; else if(rc[r]==2)p++; }
    if(q && best<5) best=5;
    if((t>=2 || (t>=1&&p>=1)) && best<4) best=4;
    if(best<3){
      int m=0; for(int r=0;r<13;r++) if(rc[r]) m|=1<<r;
      int ext=(m<<1)|((m>>12)&1); int isst=0;
      for(int top=12;top>=3;top--){int need=0x1F<<(top+1-4); if((ext&need)==need){isst=1;break;}}
      if(isst) best=2;
    }
    if(best<1 && t>=1) best=1;
    six[best]++;
  }
  printf("SIX none=%ld trips=%ld straight=%ld flush=%ld fh=%ld quads=%ld sf=%ld royal=%ld\n",
    six[0],six[1],six[2],six[3],six[4],six[5],six[6],six[7]);
  return 0;
}
