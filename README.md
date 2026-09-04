```mermaid
flowchart TD
    A[Command Line] -->|Request| B(Candidate ID)
    B --> C{PAC Donations, Amount Raised/Spent}
    C -->|One| D[Pie Chart with Donors]
    C -->|Two| E[Number of terms]
    C -->|Three| F[Time until re-election]
```
## Building an easier way to learn about Federal Politicians

## Hypothesis

## Data Sources

- **OpenFEC API** — PAC disbursements (Schedule B) to candidate campaigns, 2022 cycle

# 1. Install dependencies
pip install -r requirements.txt

# 2. Add your API key (from api.data.gov) to .env
echo "API_KEY=your_key_here" > .env

# 3. Run the full pipeline
python main.py
