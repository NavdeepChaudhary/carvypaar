"""Listings: CRUD, permissions, search/filter/sort/pagination, photos, favorites."""
from io import BytesIO

import pytest
from PIL import Image

from app.core.config import settings
from tests.conftest import auth_header

CAR = {
    "title": "2021 BMW M340i xDrive",
    "make": "BMW",
    "model": "M340i",
    "year": 2021,
    "mileage": 24000,
    "fuel_type": "petrol",
    "transmission": "automatic",
    "body_type": "sedan",
    "condition": "excellent",
    "color": "Portimao Blue",
    "location": "Mumbai",
    "price": 5800000,
    "description": "Single owner, full BMW service history.",
    "features": ["Sunroof", "Harman Kardon", "sunroof", "  "],
}


def png_bytes(size=(400, 300), color=(200, 20, 40)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture()
def seller(register_user):
    return register_user("seller@example.com", role="seller")


@pytest.fixture()
def buyer(register_user):
    return register_user("buyer@example.com", role="buyer")


def create_car(client, token, **overrides):
    res = client.post("/api/listings", json={**CAR, **overrides}, headers=auth_header(token))
    assert res.status_code == 201, res.text
    return res.json()


# ---------------------------------------------------------------- create / permissions
def test_seller_creates_listing(client, seller):
    car = create_car(client, seller["access_token"])
    assert car["status"] == "active"  # approval disabled by default in Phase 2
    assert car["price"] == 5800000.0 and isinstance(car["price"], float)
    assert car["features"] == ["Sunroof", "Harman Kardon"]  # trimmed + de-duplicated
    assert car["seller"]["full_name"] == "Test Driver"
    assert "email" not in car["seller"]
    assert car["is_owner"] is True


def test_buyer_and_anonymous_cannot_create(client, buyer):
    assert client.post("/api/listings", json=CAR).status_code == 401
    assert client.post("/api/listings", json=CAR, headers=auth_header(buyer["access_token"])).status_code == 403


@pytest.mark.parametrize(
    "override",
    [{"year": 1800}, {"year": 2999}, {"mileage": -5}, {"price": 0}, {"fuel_type": "steam"},
     {"title": "abc"}, {"features": ["x" * 51]}, {"price": 123.456}],
)
def test_create_validation(client, seller, override):
    res = client.post("/api/listings", json={**CAR, **override}, headers=auth_header(seller["access_token"]))
    assert res.status_code == 422


def test_approval_flow_when_enabled(client, seller, monkeypatch):
    monkeypatch.setattr(settings, "REQUIRE_LISTING_APPROVAL", True)
    car = create_car(client, seller["access_token"])
    assert car["status"] == "pending"
    # Hidden from the public, visible to the owner.
    assert client.get(f"/api/listings/{car['id']}").status_code == 404
    assert client.get("/api/listings").json()["total"] == 0
    assert client.get(f"/api/listings/{car['id']}", headers=auth_header(seller["access_token"])).status_code == 200
    # Owner can't self-approve.
    res = client.patch(f"/api/listings/{car['id']}", json={"status": "active"},
                       headers=auth_header(seller["access_token"]))
    assert res.status_code == 409


def test_update_and_status_transitions(client, seller):
    token = seller["access_token"]
    car = create_car(client, token)
    res = client.patch(f"/api/listings/{car['id']}", json={"price": 5500000, "mileage": 25000}, headers=auth_header(token))
    assert res.status_code == 200
    assert res.json()["price"] == 5500000.0

    sold = client.patch(f"/api/listings/{car['id']}", json={"status": "sold"}, headers=auth_header(token))
    assert sold.json()["status"] == "sold"
    assert client.get(f"/api/listings/{car['id']}").status_code == 404  # no longer public


def test_non_owner_cannot_modify(client, seller, register_user):
    car = create_car(client, seller["access_token"])
    other = register_user("other@example.com", role="seller")
    headers = auth_header(other["access_token"])
    assert client.patch(f"/api/listings/{car['id']}", json={"price": 1}, headers=headers).status_code == 403
    assert client.delete(f"/api/listings/{car['id']}", headers=headers).status_code == 403


def test_delete_listing(client, seller):
    token = seller["access_token"]
    car = create_car(client, token)
    assert client.delete(f"/api/listings/{car['id']}", headers=auth_header(token)).status_code == 204
    assert client.get(f"/api/listings/{car['id']}").status_code == 404


def test_views_count_once_per_device_not_per_reload(client, seller):
    car = create_car(client, seller["access_token"])
    url = f"/api/listings/{car['id']}"

    # Reading a listing never counts (server-side renders, link previews, refreshes).
    for _ in range(3):
        assert client.get(url).json()["views_count"] == 0

    # First view from this browser counts and hands it a device cookie...
    first = client.post(f"{url}/view")
    assert first.status_code == 200 and first.json() == {"views_count": 1, "counted": True}
    device = client.cookies.get("cv_device")
    assert device and len(device) == 32
    # ...and reloading the page any number of times doesn't.
    for _ in range(3):
        assert client.post(f"{url}/view").json() == {"views_count": 1, "counted": False}
    assert client.cookies.get("cv_device") == device

    # A different device counts once too.
    client.cookies.clear()
    assert client.post(f"{url}/view").json() == {"views_count": 2, "counted": True}
    # A tampered cookie is replaced with a fresh id instead of being trusted.
    client.cookies.clear()
    tampered = client.post(f"{url}/view", cookies={"cv_device": "not-a-device-id"})
    assert tampered.json()["counted"] is True
    assert "cv_device=" in tampered.headers["set-cookie"] and "not-a-device-id" not in tampered.headers["set-cookie"]

    # The seller's own views never count, even from a new device.
    client.cookies.clear()
    own = client.post(f"{url}/view", headers=auth_header(seller["access_token"])).json()
    assert own == {"views_count": 3, "counted": False}
    assert client.get(url).json()["views_count"] == 3


def test_view_of_missing_listing_is_404(client):
    assert client.post("/api/listings/999999/view").status_code == 404


# ---------------------------------------------------------------- search
def test_search_filters_sort_and_paginate(client, seller):
    token = seller["access_token"]
    create_car(client, token, make="BMW", model="M340i", price=5800000, year=2021, fuel_type="petrol")
    create_car(client, token, make="Tata", model="Nexon EV", title="2023 Tata Nexon EV", price=1400000,
               year=2023, fuel_type="electric", body_type="suv", mileage=8000)
    create_car(client, token, make="Hyundai", model="Creta", title="2019 Hyundai Creta SX", price=1100000,
               year=2019, fuel_type="diesel", body_type="suv", mileage=60000, transmission="manual")

    def search(**params):
        res = client.get("/api/listings", params=params)
        assert res.status_code == 200, res.text
        return res.json()

    assert search()["total"] == 3
    assert [i["make"] for i in search(sort="price_asc")["items"]] == ["Hyundai", "Tata", "BMW"]
    assert [i["year"] for i in search(sort="year_desc")["items"]] == [2023, 2021, 2019]
    assert search(q="nexon")["total"] == 1
    assert search(q="tata ev")["total"] == 1
    assert search(q="tata bmw")["total"] == 0  # every term must match
    assert search(make="bmw")["total"] == 1  # case-insensitive
    assert search(body_type="suv")["total"] == 2
    assert search(fuel_type="electric")["items"][0]["model"] == "Nexon EV"
    assert search(min_price=1200000, max_price=6000000)["total"] == 2
    assert search(max_mileage=30000)["total"] == 2
    assert search(min_year=2020, transmission="automatic")["total"] == 2
    assert search(location="mum")["total"] == 3

    page = search(page_size=2, page=2, sort="price_asc")
    assert page["pages"] == 2 and len(page["items"]) == 1 and page["items"][0]["make"] == "BMW"


def test_search_rejects_bad_params(client):
    assert client.get("/api/listings", params={"sort": "drop table"}).status_code == 422
    assert client.get("/api/listings", params={"page_size": 500}).status_code == 422
    assert client.get("/api/listings", params={"min_price": 10, "max_price": 5}).status_code == 422


def test_search_like_wildcards_are_literal(client, seller):
    create_car(client, seller["access_token"])
    assert client.get("/api/listings", params={"q": "%"}).json()["total"] == 0
    assert client.get("/api/listings", params={"q": "_"}).json()["total"] == 0


def test_makes_endpoint(client, seller):
    token = seller["access_token"]
    create_car(client, token, make="BMW", model="M340i")
    create_car(client, token, make="bmw", model="X5")
    create_car(client, token, make="Audi", model="A4")
    makes = client.get("/api/listings/makes").json()
    assert [m["make"] for m in makes] == ["Audi", "BMW"]
    assert makes[1]["count"] == 2 and makes[1]["models"] == ["M340i", "X5"]


# ---------------------------------------------------------------- photos
def test_upload_reorder_delete_images(client, seller):
    token = seller["access_token"]
    car = create_car(client, token)
    files = [("files", (f"car{i}.png", png_bytes(), "image/png")) for i in range(3)]
    res = client.post(f"/api/listings/{car['id']}/images", files=files, headers=auth_header(token))
    assert res.status_code == 201, res.text
    images = res.json()
    assert len(images) == 3 and all(i["url"].endswith(".webp") for i in images)

    ids = [i["id"] for i in images]
    reordered = client.put(f"/api/listings/{car['id']}/images/order", json={"image_ids": ids[::-1]},
                           headers=auth_header(token)).json()
    assert [i["id"] for i in reordered] == ids[::-1]

    assert client.delete(f"/api/listings/{car['id']}/images/{ids[0]}", headers=auth_header(token)).status_code == 204
    detail = client.get(f"/api/listings/{car['id']}", headers=auth_header(token)).json()
    assert detail["image_count"] == 2
    assert [i["position"] for i in detail["images"]] == [0, 1]
    assert detail["cover_image"] == detail["images"][0]["url"]


def test_upload_rejects_non_images_and_spoofed_types(client, seller):
    token = seller["access_token"]
    car = create_car(client, token)
    url = f"/api/listings/{car['id']}/images"
    fake = [("files", ("evil.png", b"<?php system($_GET['c']); ?>", "image/png"))]
    assert client.post(url, files=fake, headers=auth_header(token)).status_code == 422
    pdf = [("files", ("doc.pdf", b"%PDF-1.4", "application/pdf"))]
    assert client.post(url, files=pdf, headers=auth_header(token)).status_code == 422
    tiny = [("files", ("tiny.png", png_bytes((50, 50)), "image/png"))]
    assert client.post(url, files=tiny, headers=auth_header(token)).status_code == 422
    # A bad file in a batch rejects the whole batch.
    mixed = [("files", ("ok.png", png_bytes(), "image/png")), fake[0]]
    assert client.post(url, files=mixed, headers=auth_header(token)).status_code == 422
    assert client.get(f"/api/listings/{car['id']}").json()["image_count"] == 0


def test_upload_limit_of_ten(client, seller):
    token = seller["access_token"]
    car = create_car(client, token)
    url = f"/api/listings/{car['id']}/images"
    eight = [("files", (f"{i}.png", png_bytes(), "image/png")) for i in range(8)]
    assert client.post(url, files=eight, headers=auth_header(token)).status_code == 201
    three = [("files", (f"{i}.png", png_bytes(), "image/png")) for i in range(3)]
    res = client.post(url, files=three, headers=auth_header(token))
    assert res.status_code == 400 and "2 more" in res.json()["detail"]


def test_only_owner_uploads(client, seller, buyer):
    car = create_car(client, seller["access_token"])
    files = [("files", ("a.png", png_bytes(), "image/png"))]
    res = client.post(f"/api/listings/{car['id']}/images", files=files, headers=auth_header(buyer["access_token"]))
    assert res.status_code == 403


# ---------------------------------------------------------------- favorites
def test_favorites(client, seller, buyer):
    car = create_car(client, seller["access_token"])
    headers = auth_header(buyer["access_token"])
    assert client.post(f"/api/listings/{car['id']}/favorite", headers=headers).status_code == 204
    assert client.post(f"/api/listings/{car['id']}/favorite", headers=headers).status_code == 204  # idempotent

    assert client.get("/api/listings", headers=headers).json()["items"][0]["is_favorite"] is True
    assert client.get("/api/listings").json()["items"][0]["is_favorite"] is False
    assert client.get(f"/api/listings/{car['id']}", headers=headers).json()["favorites_count"] == 1
    favs = client.get("/api/users/me/favorites", headers=headers).json()
    assert [f["id"] for f in favs] == [car["id"]]

    assert client.delete(f"/api/listings/{car['id']}/favorite", headers=headers).status_code == 204
    assert client.get("/api/users/me/favorites", headers=headers).json() == []


def test_my_listings_includes_all_statuses(client, seller):
    token = seller["access_token"]
    a = create_car(client, token)
    create_car(client, token, title="Second car for sale")
    client.patch(f"/api/listings/{a['id']}", json={"status": "inactive"}, headers=auth_header(token))
    mine = client.get("/api/users/me/listings", headers=auth_header(token)).json()
    assert sorted(m["status"] for m in mine) == ["active", "inactive"]
