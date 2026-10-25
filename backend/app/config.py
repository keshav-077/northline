"""Application configuration. Environment variables override the January 2026 defaults."""

from datetime import date
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]

LICENCE = "Contains BMRS data © Elexon Limited copyright and database right 2026"
LICENCE_URL = (
    "https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/"
    "copyright-licence-bmrs-data/"
)

CUTOFFS: dict[str, tuple[int, int]] = {
    "09:20": (9, 20),
    "09:50": (9, 50),
    "15:30": (15, 30),
}
STRATEGIES = ("single_vintage", "latest_interval")
DEFAULT_CUTOFF = "09:20"
DEFAULT_STRATEGY = "single_vintage"
SANITY_BOUND_MW = 50_000


def resolve_path(value: Path) -> Path:
    if value.is_absolute():
        return value
    return REPO_ROOT / value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    snapshot_path: Path = Path("data/snapshot")
    static_dir: Path | None = None
    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1"
    elexon_api_key: str | None = None
    sanity_bound_mw: int = SANITY_BOUND_MW
    decision_from: date = date(2026, 1, 1)
    decision_to: date = date(2026, 1, 31)

    @field_validator("static_dir", "elexon_api_key", mode="before")
    @classmethod
    def empty_string_is_none(cls, value: object) -> object:
        if value == "":
            return None
        return value

    @property
    def snapshot_dir(self) -> Path:
        return resolve_path(self.snapshot_path)

    @property
    def static_path(self) -> Path | None:
        if self.static_dir is None:
            return None
        return resolve_path(self.static_dir)


def get_settings() -> Settings:
    return Settings()
