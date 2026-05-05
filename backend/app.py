from flask import request
from flask import jsonify
import os
from flask import Flask
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

supabase: Client = create_client(
    os.environ.get("SUPABASE_URL"),
    os.environ.get("SUPABASE_KEY")
)

@app.route("/pg", methods=["GET"])
def get_all_pgs():
    res = supabase.table("pgs").select("*, pg_rent(room_type, monthly_rent, rating)").execute()
    return jsonify(res.data)

@app.route("/pg/<int:pg_id>", methods=["GET"])
def get_pg(pg_id):
    pg_res = supabase.table("pgs").select("*").eq("id", pg_id).single().execute()

    if not pg_res.data:
        return jsonify({"error": "Not found"}), 404

    rent_res = supabase.table("pg_rent").select("*").eq("pg_id", pg_id).execute()

    pg_data = pg_res.data
    pg_data["rents"] = rent_res.data

    return jsonify(pg_data)

@app.route("/pg", methods=["POST"])
def create_pg():
    data = request.json

    res = supabase.table("pgs").insert({
        "name": data["name"],
        "address": data["address"],
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "pg_type": data["pg_type"],
        "room_types": data.get("room_types"),
        "amenities": data.get("amenities"),
        "food": data.get("food"),
        "contact": data.get("contact")
    }).execute()

    return jsonify(res.data)

@app.route("/pg-rent", methods=["POST"])
def create_rent():
    data = request.json

    res = supabase.table("pg_rent").insert({
        "pg_id": data["pg_id"],
        "room_type": data["room_type"],
        "monthly_rent": data["monthly_rent"],
        "deposit": data.get("deposit"),
        "refundable_deposit": data.get("refundable_deposit"),
        "notice_period_days": data.get("notice_period_days"),
        "rating": data.get("rating"),
        "comment": data.get("comment")
    }).execute()

    return jsonify(res.data)

if __name__ == '__main__':
    app.run(debug=True)