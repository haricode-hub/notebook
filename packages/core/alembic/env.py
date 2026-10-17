import asyncio

from alembic import context
from opennotebook_core.config import get_settings
from opennotebook_core.models import Base
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

config = context.config
config.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))
target_metadata = Base.metadata
AUTH_TABLES = {"user", "session", "account", "verification", "jwks"}


def include_object(
    object: object, name: str | None, type_: str, reflected: bool, compare_to: object
) -> bool:
    if type_ == "table" and name:
        # Auth and plugin tables remain Better Auth owned.
        # Only tables declared in our metadata are managed.
        return name not in AUTH_TABLES and (not reflected or name in target_metadata.tables)
    return True


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection, target_metadata=target_metadata, include_object=include_object
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    engine = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(run_async_migrations())
