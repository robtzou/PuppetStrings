"""
FEC API Request Cheatsheet
==========================
Quick-reference helper functions for the OpenFEC API.
Base URL: https://api.open.fec.gov/v1

Get your free API key at: https://api.data.gov/signup/
"""

import requests

BASE = "https://api.open.fec.gov/v1"
API_KEY = "DEMO_KEY"  # Replace with your key


def _get(endpoint, **params):
    """Make a GET request to the FEC API."""
    params["api_key"] = API_KEY
    r = requests.get(f"{BASE}{endpoint}", params=params)
    r.raise_for_status()
    return r.json()


# ──────────────────────────────────────────────
# 1. CANDIDATE LOOKUP
# ──────────────────────────────────────────────

def search_candidate(name):
    """Search for a candidate by name. Returns candidate_id, party, state, office."""
    return _get("/candidates/search/", q=name)

def get_candidate(candidate_id):
    """Get full details for a candidate."""
    return _get(f"/candidate/{candidate_id}/")

def get_candidate_committees(candidate_id):
    """Get all committees linked to a candidate (need committee_id for money endpoints)."""
    return _get(f"/candidate/{candidate_id}/committees/")

def get_candidate_totals(candidate_id, cycle=2024):
    """High-level financial summary: receipts, disbursements, cash on hand, debts."""
    return _get(f"/candidate/{candidate_id}/totals/", cycle=cycle)


# ──────────────────────────────────────────────
# 2. MONEY IN — Schedule A (Receipts)
# ──────────────────────────────────────────────

def get_individual_contributions(committee_id, cycle=2024, per_page=20):
    """Itemized individual donations (>$200): donor name, employer, occupation, amount."""
    return _get("/schedules/schedule_a/",
                committee_id=committee_id,
                two_year_transaction_period=cycle,
                is_individual=True,
                sort="-contribution_receipt_amount",
                per_page=per_page)

def get_pac_contributions(committee_id, cycle=2024, per_page=20):
    """PAC/committee contributions to this candidate's committee."""
    return _get("/schedules/schedule_a/",
                committee_id=committee_id,
                two_year_transaction_period=cycle,
                contributor_type="C",
                sort="-contribution_receipt_amount",
                per_page=per_page)

def get_contributions_by_size(committee_id, cycle=2024):
    """Breakdown by donation size bucket ($1-200, $200-499, $500-999, etc.)."""
    return _get("/schedules/schedule_a/by_size/",
                committee_id=committee_id, cycle=cycle)

def get_contributions_by_state(committee_id, cycle=2024):
    """Contributions aggregated by donor state (in-state vs. out-of-state)."""
    return _get("/schedules/schedule_a/by_state/",
                committee_id=committee_id, cycle=cycle)

def get_contributions_by_employer(committee_id, cycle=2024):
    """Contributions aggregated by employer (reveals industry ties)."""
    return _get("/schedules/schedule_a/by_employer/",
                committee_id=committee_id, cycle=cycle)

def get_contributions_by_occupation(committee_id, cycle=2024):
    """Contributions aggregated by occupation."""
    return _get("/schedules/schedule_a/by_occupation/",
                committee_id=committee_id, cycle=cycle)


# ──────────────────────────────────────────────
# 3. MONEY OUT — Schedule B (Disbursements)
# ──────────────────────────────────────────────

def get_disbursements(committee_id, cycle=2024, per_page=20):
    """Where the campaign spends money: staff, consultants, ads, travel."""
    return _get("/schedules/schedule_b/",
                committee_id=committee_id,
                two_year_transaction_period=cycle,
                sort="-disbursement_amount",
                per_page=per_page)

def get_pac_to_candidate(pac_committee_id, recipient_committee_id, cycle=2024):
    """How much a specific PAC gave to a specific candidate's committee."""
    return _get("/schedules/schedule_b/",
                committee_id=pac_committee_id,
                recipient_committee_id=recipient_committee_id,
                two_year_transaction_period=cycle)


# ──────────────────────────────────────────────
# 4. OUTSIDE SPENDING — Schedule E & Comms
# ──────────────────────────────────────────────

def get_independent_expenditures(candidate_id, cycle=2024, per_page=20):
    """Super PAC / outside group spending FOR or AGAINST a candidate."""
    return _get("/schedules/schedule_e/",
                candidate_id=candidate_id, cycle=cycle,
                sort="-expenditure_amount",
                per_page=per_page)

def get_independent_expenditures_by_candidate(candidate_id, cycle=2024):
    """Aggregated outside spending totals (support vs. oppose) per spender."""
    return _get("/schedules/schedule_e/by_candidate/",
                candidate_id=candidate_id, cycle=cycle)

def get_electioneering(candidate_id):
    """Broadcast ads mentioning a candidate near an election."""
    return _get("/electioneering/", candidate_id=candidate_id)

def get_communication_costs(candidate_id, cycle=2024):
    """Corporate/union internal communications advocating for/against a candidate."""
    return _get("/communication_costs/",
                candidate_id=candidate_id, cycle=cycle)


# ──────────────────────────────────────────────
# 5. ELECTIONS & REPORTS
# ──────────────────────────────────────────────

def get_election(state, cycle=2024, office="house", district="01"):
    """Compare fundraising across all candidates in a race."""
    return _get("/elections/",
                state=state, cycle=cycle,
                office=office, district=district)

def get_committee_reports(committee_id, cycle=2024):
    """Quarterly/monthly filing reports — fundraising trajectory over time."""
    return _get(f"/committee/{committee_id}/reports/", cycle=cycle)


# ──────────────────────────────────────────────
# EXAMPLE USAGE
# ──────────────────────────────────────────────

if __name__ == "__main__":
    # 1) Find a candidate
    results = search_candidate("Alsobrooks")
    candidate = results["results"][0]
    cid = candidate["candidate_id"]
    print(f"Found: {candidate['name']} ({cid})")

    # 2) Get their committee
    committees = get_candidate_committees(cid)
    committee_id = committees["results"][0]["committee_id"]
    print(f"Committee: {committee_id}")

    # 3) Financial summary
    totals = get_candidate_totals(cid)
    t = totals["results"][0]
    print(f"Receipts: ${t['receipts']:,.0f}")
    print(f"Cash on hand: ${t['cash_on_hand_end_period']:,.0f}")

    # 4) Top individual donors
    donors = get_individual_contributions(committee_id, per_page=5)
    print("\nTop donors:")
    for d in donors["results"]:
        print(f"  ${d['contribution_receipt_amount']:>10,.0f}  "
              f"{d['contributor_name']}  ({d.get('contributor_employer', '?')})")

    # 5) Donation size breakdown
    sizes = get_contributions_by_size(committee_id)
    print("\nDonation size breakdown:")
    for s in sizes["results"]:
        print(f"  {s['size']:>10}  ${s['total']:,.0f}")
