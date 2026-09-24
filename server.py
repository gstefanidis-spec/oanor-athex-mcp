import os
from typing import Any, Literal

import httpx
from mcp.server.mcpserver import MCPServer

BASE_URL = os.getenv("OANOR_BASE_URL", "https://api.oanor.com/athex-api").rstrip("/")
API_KEY = os.getenv("OANOR_API_KEY", "").strip()
TIMEOUT_SECONDS = float(os.getenv("OANOR_TIMEOUT_SECONDS", "15"))

mcp = MCPServer("Oanor ATHEX")


def _headers() -> dict[str, str]:
    if not API_KEY:
        raise RuntimeError(
            "OANOR_API_KEY is not configured on the MCP server. "
            "Set it as a server-side environment secret; never send it as a tool argument."
        )
    return {
        "x-oanor-key": API_KEY,
        "accept": "application/json",
        "user-agent": "oanor-athex-mcp/1.0",
    }


async def _get(path: str, params: dict[str, Any] | None = None) -> Any:
    url = f"{BASE_URL}{path}"
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, follow_redirects=True) as client:
        response = await client.get(url, params=params, headers=_headers())

    if response.status_code == 429:
        raise RuntimeError("Oanor rate limit/quota exceeded (HTTP 429).")
    if response.status_code in (401, 403):
        raise RuntimeError(
            f"Oanor authentication failed (HTTP {response.status_code}). "
            "Check OANOR_API_KEY and the subscription for athex-api."
        )
    if response.status_code >= 400:
        body = response.text[:1000]
        raise RuntimeError(f"Oanor API error HTTP {response.status_code}: {body}")

    try:
        return response.json()
    except ValueError as exc:
        raise RuntimeError("Oanor returned a non-JSON response.") from exc


@mcp.tool()
async def athex_quote(codes: list[str] | str) -> Any:
    """Get the current OANOR ATHEX quote for one or more Athens Stock Exchange tickers.

    Args:
        codes: One ticker (e.g. "OTE") or a list of tickers
               (e.g. ["OTE", "PPC", "TITC", "BELA"]).

    Returns the upstream OANOR JSON unchanged so timestamps and source metadata
    remain auditable. OANOR meta.timestamp is retrieval time, not necessarily the
    exchange last-trade timestamp.
    """
    if isinstance(codes, str):
        normalized = [codes.strip().upper()]
    else:
        normalized = [str(c).strip().upper() for c in codes if str(c).strip()]
    if not normalized:
        raise ValueError("Provide at least one ATHEX ticker code.")
    if len(normalized) > 50:
        raise ValueError("Maximum 50 ticker codes per call.")

    return await _get("/v1/quote", {"codes": ",".join(normalized)})


@mcp.tool()
async def athex_screener(
    screen: Literal["gainers", "losers", "active", "marketcap"] = "active",
    limit: int = 20,
) -> Any:
    """Run the OANOR ATHEX ranked market screener.

    Args:
        screen: gainers, losers, active, or marketcap.
        limit: Number of rows requested (1-100).
    """
    if limit < 1 or limit > 100:
        raise ValueError("limit must be between 1 and 100.")
    return await _get("/v1/screener", {"screen": screen, "limit": limit})


@mcp.tool()
async def athex_index(name: Literal["GD", "FTSE"] = "GD") -> Any:
    """Get a current Athens index value from OANOR.

    Args:
        name: GD for ATHEX Composite General Index, or FTSE for FTSE/ATHEX Large Cap.
    """
    return await _get("/v1/index", {"name": name})


@mcp.tool()
async def athex_meta() -> Any:
    """Return OANOR ATHEX service metadata and endpoint catalog.

    Use this first when diagnosing connectivity, authentication, endpoint changes,
    or source/timestamp semantics.
    """
    return await _get("/v1/meta")


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=port,
        streamable_http_path="/mcp",
        json_response=True,
    )
