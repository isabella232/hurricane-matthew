#!/usr/bin/env python

import agate
import geojson
import proof


def pick_first(c):
    return c[0]


def saffir(r):
    max_wind = r['max_wind_kt']

    if max_wind < 64:
        return 0
    elif max_wind < 83:
        return 1
    elif max_wind < 96:
        return 2
    elif max_wind < 113:
        return 3
    elif max_wind < 137:
        return 4
    else:
        return 5


class LineString(agate.Aggregation):
    def __init__(self, lat_column, lng_column):
        self._lat_column_name = lat_column
        self._lng_column_name = lng_column

    def get_aggregate_data_type(self, table):
        return agate.Text()

    def validate(self, table):
        lat_column = table.columns[self._lat_column_name]
        lng_column = table.columns[self._lng_column_name]

        if not isinstance(lat_column.data_type, agate.Number) or not isinstance(lng_column.data_type, agate.Number):
            raise DataTypeError('LineString can only be applied to columns containing Number data.')

    def run(self, table):
        lat_column = table.columns[self._lat_column_name]
        lng_column = table.columns[self._lng_column_name]

        points = []

        for lat, lng in zip(lat_column, lng_column):
            points.append((float(lng), float(lat)))

        return str(geojson.LineString(points))


def load_data(data):
    data['table'] = agate.Table.from_csv('data/Basin.NA.ibtracs_wmo.v03r09.csv', column_types={
        'Serial_Num': agate.Text()
    })

def summarize(data):
    by_serial = data['table'].group_by('Serial_Num')

    data['summarized'] = by_serial.aggregate([
        ('year', agate.Summary('Season', agate.Number(), pick_first)),
        ('name', agate.Summary('Name', agate.Text(), pick_first)),
        ('max_wind_kt', agate.Max('Wind(WMO)')),
        ('track', LineString('Latitude', 'Longitude')),
    ])

def rank_and_filter(data):
    data['ranked'] = data['summarized'].compute([
        ('saffir', agate.Formula(agate.Number(), saffir)),
    ]).where(lambda r: r['year'] >= 1965 and r['saffir'] >= 5)

def save(data):
    features = []

    for row in data['ranked'].rows:
        geom = geojson.loads(row['track'])
        feature = geojson.Feature(
            geometry=geom,
            properties={
                'name': row['name'],
                'year': int(row['year']),
                'saffir': int(row['saffir'])
            }
        )

        features.append(feature)

    with open('tracks.json', 'w') as f:
        geojson.dump(geojson.FeatureCollection(features), f, indent=4)

    data['ranked'].to_csv('tracks.csv')


data_loaded = proof.Analysis(load_data)
summarized = data_loaded.then(summarize)
ranked = summarized.then(rank_and_filter)
ranked.then(save)
data_loaded.run()
