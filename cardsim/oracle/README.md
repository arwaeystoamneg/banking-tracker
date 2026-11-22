Verified oracle scripts (exact enumeration). Run from this folder:
  gcc -O2 -o tcp tcp.c -lm && ./tcp > tcp_out.txt   # ~5 s; 3CP ante/play + 6-card bonus counts
  python3 tcp_analyze.py                            # HE/SD for ante bonus, pair plus, 6CB tables
  python3 bac.py                                    # ~4 s; 8D/6D baccarat EV/SD/cov -> bac_out.json
  python3 ref.py                                    # rebuilds ../reference_values.json
