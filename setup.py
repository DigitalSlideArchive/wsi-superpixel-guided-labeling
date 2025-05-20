from setuptools import setup, find_packages

with open('README.rst') as readme_file:
    readme = readme_file.read()

requirements = [
    'girder>=3.0.0a1'
]

setup(
    name='histomics_label',
    author='Kitware, Inc.',
    author_email='kitware@kitware.com',
    classifiers=[
        'Development Status :: 2 - Pre-Alpha',
        'License :: OSI Approved :: Apache Software License',
        'Natural Language :: English',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.6',
        'Programming Language :: Python :: 3.7',
        'Programming Language :: Python :: 3.8'
    ],
    description='Perform active learning with superpixel classification.',
    install_requires=[
        'histomicsui',
        'large_image[tiff,openslide,memcached,openjpeg,converter]>=1.20.6',
        'girder-large-image-annotation>=1.20.6',
        'girder-slicer-cli-web>=1.2.3',
    ],
    license='Apache Software License 2.0',
    long_description=readme,
    long_description_content_type='text/x-rst',
    include_package_data=True,
    keywords='girder-plugin, histomics_label',
    packages=find_packages(exclude=['test', 'test.*']),
    url='https://github.com/DigitalSlideArchive/wsi_superpixel_guided_labeling',
    version='0.1.0',
    zip_safe=False,
    entry_points={
        'girder.plugin': [
            'histomics_label = histomics_label:GirderPlugin'
        ]
    }
)
